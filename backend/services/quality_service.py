# services/quality_service.py
"""
Métricas de Qualidade: OK/NOK + IA vs Manual.

OK/NOK usam a coluna `Coluna` (0=OK, 1=NOK) que já é a réplica fiel da
lógica DAX original — mesma fonte que alimenta o SLA% do dashboard.

ai_incidentes/manual_incidentes (migração 2026-08, correção): antes disto
usava uma heurística errada — contava incidentes cujo "Keyword Found"
fosse SCOM/ITM/ITSI, o que mistura dois conceitos diferentes: SCOM é uma
FONTE/ferramenta de evento (de onde veio o alerta), enquanto "IA" aqui
significa quem/o quê ABRIU o incidente (operador automático vs pessoa).
Isso fazia o card "Incidentes por IA / SCOM" mostrar um número sem
relação real com automação.

Agora usa `Grupo == "AIOPER"` (transform.add_grupo_column), que já é o
sinal correto de "aberto por automação" — baseado no canal de abertura
(contact_type == "automatic") com fallback por nome de conta só quando
esse campo não vem no export. Ver ASSUNÇÃO em transform.py sobre o nome
real do cabeçalho "Channel".
"""
import pandas as pd


def _nok_mask(df: pd.DataFrame) -> pd.Series:
    return df["Coluna"] == 1


def _justificado_sla2_mask(df: pd.DataFrame) -> pd.Series:
    if "Justificado SLA2" in df.columns:
        return df["Justificado SLA2"].eq("sim")
    if "Justificado?" in df.columns:  # fallback se por algum motivo só a coluna antiga existir
        return df["Justificado?"].eq("sim")
    return pd.Series(False, index=df.index)


def get_quality_metrics(df: pd.DataFrame) -> dict:
    """
    OK/NOK/Justificado são MUTUAMENTE EXCLUSIVOS (somam o total de
    incidentes com evento) — migração 2026-08 (RESOLVIDO): antes disto
    "justificados" era uma contagem à parte que podia sobrepor OK ou NOK
    (a tabela de Justificações nunca era passada a enrich_sys_report_
    template, então na prática dava sempre 0). Agora um incidente que
    seria NOK (Coluna==1) mas tem justificação aceite pra SLA2 (ver
    services/justificacoes_service.py) sai de "nok_count" e entra em
    "justificados" — "não conta o SLA referido na tabela", como pedido.
    OK (Coluna==0) fica OK independente de ter linha na tabela de
    Justificações — não havia problema nenhum a desculpar.
    """
    total = len(df)

    com_evento = df[df["Coluna"] > -1]
    if len(com_evento) > 0:
        nok = _nok_mask(com_evento)
        justificado_nok = nok & _justificado_sla2_mask(com_evento)
        count_ok = int((com_evento["Coluna"] == 0).sum())
        count_justificados = int(justificado_nok.sum())
        count_nok = int((nok & ~justificado_nok).sum())
    else:
        count_ok = count_nok = count_justificados = 0

    ai_incs = int(df["Grupo"].eq("AIOPER").sum())
    manual_incs = total - ai_incs

    keyword_col = df.get("Keyword Found", pd.Series(dtype=str))
    keyword_count = int(keyword_col.notna().sum())

    return {
        "ok_count": count_ok,
        "nok_count": count_nok,
        "keyword_count": keyword_count,
        "justificados": count_justificados,
        "ai_incidentes": ai_incs,
        "manual_incidentes": manual_incs,
        "taxa_automacao": round((ai_incs / total * 100), 1) if total > 0 else 0.0,
        "is_ai_split_approximate": False,
        # Linha de referência do gráfico SLA2 (100 - meta 90%) — 10% dos
        # incidentes com evento do período, igual ao pedido pro SLA3
        # (lá é 30%, meta 70%).
        "sla2_threshold_pct": 10,
        "sla2_threshold_count": round(len(com_evento) * 0.10, 1),
    }


_STATUS_COLUMNS = [
    "Incidente", "short_description", "priority", "Técnico", "opened_at",
    "Column Measure", "Grupo", "SLA 3.0", "Justificacao Texto",
]


def get_incidents_by_sla_status(df: pd.DataFrame, status: str) -> list[dict]:
    """
    Lista de incidentes por trás de cada card SLA Cumprido/Falhado/
    Justificado do Report SLAs — pedido pro clique no card abrir uma
    tabela com o detalhe, em vez de só o número agregado. Mesma definição
    mutuamente exclusiva de get_quality_metrics (ver docstring lá).
    """
    com_evento = df[df["Coluna"] > -1]
    if status == "ok":
        subset = com_evento[com_evento["Coluna"] == 0]
    elif status == "nok":
        nok = _nok_mask(com_evento)
        subset = com_evento[nok & ~_justificado_sla2_mask(com_evento)]
    elif status == "justificados":
        nok = _nok_mask(com_evento)
        subset = com_evento[nok & _justificado_sla2_mask(com_evento)]
    else:
        raise ValueError(f"status inválido: '{status}' (esperado ok/nok/justificados)")

    cols = [c for c in _STATUS_COLUMNS if c in subset.columns]
    subset = subset[cols].copy()
    if "opened_at" in subset.columns:
        subset["opened_at"] = subset["opened_at"].dt.strftime("%Y-%m-%d %H:%M")
    if "SLA 3.0" in subset.columns:
        subset["sla1_minutes"] = (subset["SLA 3.0"] / 60).round(1)
        subset = subset.drop(columns=["SLA 3.0"])
    return subset.rename(columns={
        "Incidente": "number", "short_description": "description", "Técnico": "tecnico",
        "Column Measure": "region", "Justificacao Texto": "justificacao",
    }).to_dict(orient="records")


def get_sem_evento_breakdown(df: pd.DataFrame) -> dict:
    """
    Agrupa os incidentes SEM primeira ocorrência de evento real (campo
    "u_first_occurrence" nulo) por Grupo (Operação/Monitorização/AIOPER)
    + short_description — pra investigar quais tipos de incidente mais
    caem nessa categoria.

    Ajuste 2026-08: antes usava "Coluna == -1", que também classify()
    atribui a incidentes que TÊM evento mas com delta negativo (evento
    registado depois da abertura — anomalia de dados, ver
    transform.add_sla_columns). Isso inflava "Sem Evento" com casos que
    na verdade têm evento. Agora usa diretamente a nulidade do campo,
    que é a definição real de "sem evento" (confirmado nos dados reais:
    de 103 linhas com Coluna==-1, só 48 realmente não têm
    u_first_occurrence — as outras 55 têm evento com delta negativo).
    """
    total = len(df)
    sem_evento_mask = df["u_first_occurrence"].isna()
    sem_evento = df[sem_evento_mask]
    com_evento_count = total - int(sem_evento_mask.sum())

    grouped = (
        sem_evento.groupby(["Grupo", "short_description"])
        .size()
        .reset_index(name="count")
        .sort_values("count", ascending=False)
    )

    breakdown = [
        {"grupo": row["Grupo"], "short_description": row["short_description"], "count": int(row["count"])}
        for _, row in grouped.iterrows()
    ]

    return {
        "com_evento_count": com_evento_count,
        "sem_evento_count": int(len(sem_evento)),
        "breakdown": breakdown,
    }
