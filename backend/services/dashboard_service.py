# services/dashboard_service.py
"""
Recebe o DataFrame de sys_report_template já enriquecido (via
transform.enrich_sys_report_template) e calcula KPIs/gráficos. Quem
baixa e enriquece é o cache.py, uma vez por ciclo.
"""
import re

import pandas as pd

from . import team_service
from .keywords import TOOL_COLORS, TOOL_COLORS_AI

PRIORITY_LABELS = {"1": "Critical", "2": "High", "3": "Moderate", "4": "Low"}
# Paleta de marca (2026-08). ASSUNÇÃO: a tabela passada só definia P2/P3/P4
# (High/Moderate/Low) — Critical (P1) não tinha cor própria, então usei a
# mesma cor de "NOK" (#E21B23) da segunda tabela, já que P1 é a prioridade
# mais crítica e é exatamente o que SLA3/SLA4 tratam como "quebra". Avisa
# se preferires outra cor pra Critical.
PRIORITY_COLORS = {
    "Critical": "#E21B23", "High": "#FAB138", "Moderate": "#F9E33B", "Low": "#30ADDE",
}
OPEN_STATES = {"New", "In Progress", "On Hold", "1", "2", "3"}


def get_kpis(df: pd.DataFrame) -> dict:
    total_incidentes = len(df)
    is_p1 = df["priority"].astype(str).str.contains("1", na=False)
    is_open = df["incident_state"].astype(str).isin(OPEN_STATES)
    p1_ativos = int((is_p1 & is_open).sum())

    com_evento = df[df["Coluna"] > -1]
    sla_pct = 0.0
    if len(com_evento) > 0:
        ok_count = (com_evento["Coluna"] == 0).sum()
        sla_pct = round(ok_count / len(com_evento) * 100, 1)

    escalados = int(df["Grupo"].eq("Monitorização").sum())

    return {
        "total_incidentes": total_incidentes,
        "p1_ativos": p1_ativos,
        "sla": sla_pct,
        "escalados": escalados,
    }


def get_priority_breakdown(df: pd.DataFrame) -> list:
    counts = {}
    for raw_priority, label in PRIORITY_LABELS.items():
        counts[label] = int(df["priority"].astype(str).str.startswith(raw_priority).sum())
    return [{"label": label, "val": val, "color": PRIORITY_COLORS[label]} for label, val in counts.items()]


def get_tools_breakdown(df: pd.DataFrame, palette: dict = None) -> list:
    """
    `palette` opcional (ex: TOOL_COLORS_AI) pra reutilizar este cálculo em
    contextos com uma cor de marca diferente (ex: página AIOPER) sem
    duplicar a lógica de contagem. Default é a paleta principal.
    """
    palette = palette or TOOL_COLORS
    counts = df["Keyword Found"].dropna().value_counts()
    result = [
        {"name": tool, "val": int(val), "color": palette.get(tool, palette["_default"])}
        for tool, val in counts.items()
    ]
    result.sort(key=lambda x: x["val"], reverse=True)
    return result


def get_tools_sla1_failures(df: pd.DataFrame) -> list:
    """
    Ferramentas associadas a incidentes onde o SLA1 FALHOU (Coluna==1,
    ou seja, >=15min entre o evento e a abertura) — usado no gráfico
    "Falha de SLA por Ferramenta" do Report SLAs/Visão Geral. Ajuste
    2026-08: antes esse gráfico usava get_tools_breakdown (TODOS os
    incidentes), o que não representa "falha", representa volume geral —
    esse volume geral continua disponível em get_tools_breakdown, usado
    na Central Operacional ("Status de Ferramentas").
    """
    subset = df[df["Coluna"] == 1]
    return get_tools_breakdown(subset)


def _format_hms(total_seconds: float) -> str:
    h, rem = divmod(int(total_seconds), 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def get_sla1_sla2(df: pd.DataFrame) -> dict:
    """
    SLA1 = tempo médio entre o primeiro evento e a abertura (opened_at -
    u_first_occurrence), meta < 15 min. SLA2 = % de incidentes com evento
    que cumpriram esse prazo (<15min = "Coluna"==0), meta >=90%.

    Ambas dependem da coluna "SLA 3.0"/"Coluna" calculadas em
    transform.add_sla_columns. RESOLVIDO 2026-08: o campo de primeira
    ocorrência do evento já vem no export (era um nome errado no
    sysparm_fields — ver transform.py). `available=False` continua a
    existir pra cobrir o caso de um período escolhido sem NENHUM
    incidente com evento (ex: um dia sem chamados) — nesse caso não há
    SLA1/SLA2 real pra mostrar, e o frontend exibe "indisponível" em vez
    de um 0%/00:00:00 que pareceria uma medida real.

    SLA1 ganhou uma segunda média "com justificações" (migração 2026-08):
    "avg_seconds" continua a ser o número BRUTO (todos os incidentes com
    evento, igual a sempre — no dashboard antigo isto é rotulado "Sem
    Justificações"). "avg_seconds_justificado" exclui os incidentes com
    justificação aceite pra SLA1 (ver justificacoes_service.py) — a ideia
    é que um evento com "first occurrence" claramente errada (ex: chegou
    atrasado da monitorização) não devia inflacionar a média real de
    escalonamento; removê-lo dá o número "limpo" ("Com Justificações").
    """
    com_evento = df[df["Coluna"] > -1]
    available = len(com_evento) > 0

    if available:
        avg_seconds = com_evento["SLA 3.0"].mean()
        ok_count = int((com_evento["Coluna"] == 0).sum())
        sla2_pct = round(ok_count / len(com_evento) * 100, 2)

        if "Justificado SLA1" in com_evento.columns:
            sem_justificados = com_evento[com_evento["Justificado SLA1"] != "sim"]
        else:
            sem_justificados = com_evento
        avg_seconds_justificado = sem_justificados["SLA 3.0"].mean() if len(sem_justificados) > 0 else avg_seconds
    else:
        avg_seconds = 0.0
        avg_seconds_justificado = 0.0
        sla2_pct = 0.0

    return {
        "sla1": {
            "avg_seconds": round(float(avg_seconds), 1) if avg_seconds == avg_seconds else 0,
            "avg_time": _format_hms(avg_seconds) if avg_seconds == avg_seconds else "00:00:00",
            "avg_seconds_justificado": round(float(avg_seconds_justificado), 1) if avg_seconds_justificado == avg_seconds_justificado else 0,
            "avg_time_justificado": _format_hms(avg_seconds_justificado) if avg_seconds_justificado == avg_seconds_justificado else "00:00:00",
            "target_minutes": 15,
            "available": available,
        },
        "sla2": {
            "pct": sla2_pct,
            "target": 90,
            "available": available,
        },
    }


def get_sla1_sla2_by_priority(df: pd.DataFrame) -> list:
    """
    SLA1/SLA2 quebrados por nível de prioridade (Critical/High/Moderate/
    Low) — detalhe extra pedido pro Report SLAs, em cima do número
    global já mostrado na Visão Geral.
    """
    result = []
    for raw_priority, label in PRIORITY_LABELS.items():
        subset = df[df["priority"].astype(str).str.startswith(raw_priority)]
        sla = get_sla1_sla2(subset)
        result.append({
            "priority": label,
            "color": PRIORITY_COLORS[label],
            "total": int(len(subset)),
            "sla1": sla["sla1"],
            "sla2": sla["sla2"],
        })
    return result


def get_grupo_breakdown(df: pd.DataFrame) -> list:
    """Distribuição de incidentes por Grupo (Operação/Monitorização/AIOPER), em % do total."""
    counts = df["Grupo"].value_counts()
    total = int(counts.sum())
    if total == 0:
        return []
    return [
        {"grupo": grupo, "val": int(val), "pct": round(val / total * 100, 1)}
        for grupo, val in counts.items()
    ]


def get_source_by_day(df: pd.DataFrame) -> dict:
    """
    Pivot Source (linha) x dia de abertura (coluna) -> nº de incidentes —
    pedido pra Central Operacional, réplica da tabela do dashboard
    antigo. Usa "Source" (não "Keyword Found"): é a única coluna que já
    distingue região pra OEM/SOLMAN (ex: "OEM BR" vs "OEM PT" — ver
    transform.add_keyword_columns), que é o que a tabela de referência
    mostrava. Incidentes sem Source (Grupo == "Monitorização", que não
    tem ferramenta/ ver add_keyword_columns) ficam de fora — não fazem
    sentido numa tabela "por fonte de evento".
    """
    subset = df[df["Source"].notna() & df["opened_at"].notna()].copy()
    if subset.empty:
        return {"days": [], "rows": [], "day_totals": {}, "grand_total": 0}

    subset["_day"] = subset["opened_at"].dt.strftime("%Y-%m-%d")
    pivot = subset.groupby(["Source", "_day"]).size().unstack(fill_value=0)
    days = sorted(pivot.columns)
    pivot = pivot[days]

    row_totals = pivot.sum(axis=1).sort_values(ascending=False)
    rows = [
        {"source": source, "total": int(row_totals[source]), "values": {day: int(pivot.loc[source, day]) for day in days}}
        for source in row_totals.index
    ]
    day_totals = {day: int(pivot[day].sum()) for day in days}

    return {
        "days": days,
        "rows": rows,
        "day_totals": day_totals,
        "grand_total": int(row_totals.sum()),
    }


def get_incidents_list(
    df: pd.DataFrame, raw_ok_matched: pd.DataFrame | None, cis_matched: pd.DataFrame | None
) -> list[dict]:
    """
    Uma linha por incidente do período: quem abriu (df/"Técnico"), quem
    resolveu (primeira tag OK_GCC feita por alguém, tabela "ok_"), nº de
    CI's anexados e timestamp do mais recente (tabela "cis") — réplica de
    "Lista de Incidentes" ("Lista CI's" no protótipo v20). Devolve uma
    lista de dicts pronta pra JSON, mais recente primeiro — o frontend
    filtra/ordena/exporta localmente (mesmo padrão de
    get_incidents_by_sla_status/IncidentsStatusModal.jsx).
    """
    if df.empty:
        return []

    resolver_map: dict[str, str] = {}
    if raw_ok_matched is not None and not raw_ok_matched.empty and "Title" in raw_ok_matched.columns:
        ok_df = raw_ok_matched.copy()
        if "Label" in ok_df.columns:
            ok_df = ok_df[ok_df["Label"] == "OK_GCC"]
        incidentes = ok_df["Title"].astype(str).str.extract(r"(INC\d+)", expand=False)
        tecnicos = ok_df["Created by"].apply(team_service.username_to_tecnico)
        for inc, tecnico in zip(incidentes, tecnicos):
            if inc and inc not in resolver_map:
                resolver_map[inc] = tecnico

    ci_count: dict[str, int] = {}
    ci_latest: dict[str, pd.Timestamp] = {}
    if cis_matched is not None and not cis_matched.empty:
        ci_count = cis_matched.groupby("incidente").size().to_dict()
        ci_latest = cis_matched.groupby("incidente")["created_at"].max().to_dict()

    subset = df[df["Incidente"].notna()].copy()
    subset["_opened_at_fmt"] = subset["opened_at"].dt.strftime("%Y-%m-%d %H:%M")
    subset["_opener"] = subset["Técnico"].apply(team_service.normalize_bot_name) if "Técnico" in subset.columns else ""
    if "short_description" not in subset.columns:
        subset["short_description"] = None

    # RESOLVIDO (otimização 2026-09-16): to_dict(orient="records") sobre o
    # DataFrame inteiro (~30 colunas do enrich) boxava toda coluna de toda
    # linha só pra ler 5 delas por baixo — restringir às colunas
    # realmente lidas no loop reduz o trabalho de boxing na mesma
    # proporção (medido: maior parte do tempo desta função nesse to_dict).
    cols = ["Incidente", "opened_at", "_opened_at_fmt", "short_description", "_opener"]
    rows = []
    for rec in subset[cols].to_dict(orient="records"):
        inc = rec["Incidente"]
        latest_ci = ci_latest.get(inc)
        rows.append({
            "number": inc,
            "opened_at": rec["_opened_at_fmt"] if pd.notna(rec["opened_at"]) else None,
            "short_description": rec.get("short_description") or "",
            "opener": rec.get("_opener") or "",
            "resolver": resolver_map.get(inc, ""),
            "ci_count": int(ci_count.get(inc, 0)),
            "latest_ci_at": latest_ci.strftime("%Y-%m-%d %H:%M") if pd.notna(latest_ci) else None,
        })
    rows.sort(key=lambda r: r["opened_at"] or "", reverse=True)
    return rows


def _two_level_pivot(df: pd.DataFrame, level1_col: str, level2_col: str, level1_sort_key=None) -> dict:
    """
    Pivot genérico Nível1 > Nível2 (colapsável no frontend) x mês de
    abertura -> contagem — usado por get_priority_source_pivot/
    get_source_priority_pivot ("Incidentes Abertos por Prioridade"/"por
    Source" de Central Operacional). Incidentes sem Source (Grupo ==
    "Monitorização") ficam de fora — mesma exclusão de get_source_by_day,
    já que "Source" não existe pra eles.
    """
    subset = df[df[level1_col].notna() & df[level2_col].notna() & df["opened_at"].notna()].copy()
    if subset.empty:
        return {"months": [], "rows": [], "month_totals": {}, "grand_total": 0}

    subset["_month"] = subset["opened_at"].dt.strftime("%Y-%m")
    months = sorted(subset["_month"].unique())

    rows = []
    for level1_val, group in subset.groupby(level1_col):
        by_month = group.groupby("_month").size()
        children = []
        for level2_val, sub in group.groupby(level2_col):
            sub_by_month = sub.groupby("_month").size()
            children.append({
                "label": level2_val,
                "total": int(sub_by_month.sum()),
                "by_month": {m: int(sub_by_month.get(m, 0)) for m in months},
            })
        children.sort(key=lambda c: c["total"], reverse=True)
        rows.append({
            "label": level1_val,
            "total": int(by_month.sum()),
            "by_month": {m: int(by_month.get(m, 0)) for m in months},
            "children": children,
        })
    rows.sort(key=level1_sort_key or (lambda r: -r["total"]))

    month_totals = subset.groupby("_month").size()
    return {
        "months": months,
        "rows": rows,
        "month_totals": {m: int(month_totals.get(m, 0)) for m in months},
        "grand_total": int(len(subset)),
    }


def _priority_sort_key(row: dict):
    """"1 - Critical" -> 1, "2 - High" -> 2, etc. — ordena pela severidade,
    não por volume (ao contrário do default de _two_level_pivot)."""
    m = re.match(r"\s*(\d)", str(row["label"]))
    return int(m.group(1)) if m else 99


def get_priority_source_pivot(df: pd.DataFrame) -> dict:
    """"Incidentes Abertos por Prioridade" — Prioridade (nível 1, ordem
    Critical > High > Moderate > Low) > Source (nível 2) x mês."""
    return _two_level_pivot(df, "priority", "Source", level1_sort_key=_priority_sort_key)


def get_source_priority_pivot(df: pd.DataFrame) -> dict:
    """"Incidentes Abertos por Source" — Source (nível 1, por volume) >
    Prioridade (nível 2) x mês."""
    return _two_level_pivot(df, "Source", "priority")


# ServiceNow deixa este campo por preencher em templates de alerta que nunca
# chegaram a ser configurados — confirmado nos dados reais (135 ocorrências
# de "$c_snow_correlation_display|u$" em vez de um valor real). Tratado como
# "sem dado", igual a vazio/nulo.
_CORRELATION_JUNK_MARKER = "c_snow_correlation_display"


def _tree_pivot(df: pd.DataFrame, level_cols: list[str], months: list[str]) -> list[dict]:
    """
    Pivot recursivo de N níveis (uma coluna já calculada por nível) x mês
    -> contagem — generalização de _two_level_pivot pra suportar mais de 2
    níveis (ver get_alert_type_pivot). Uma linha só ganha `children` se
    ainda houver uma próxima coluna de nível E algum registo tiver valor
    não-nulo nela — uma ferramenta sem categoria/métrica identificável
    fica só com a sua própria linha, sem nível vazio a mais.
    """
    col, rest = level_cols[0], level_cols[1:]
    rows = []
    for val, group in df[df[col].notna()].groupby(col):
        by_month = group.groupby("_month").size()
        row = {
            "label": val,
            "total": int(len(group)),
            "by_month": {m: int(by_month.get(m, 0)) for m in months},
        }
        if rest:
            children = _tree_pivot(group, rest, months)
            if children:
                row["children"] = children
        rows.append(row)
    rows.sort(key=lambda r: -r["total"])
    return rows


def get_alert_type_pivot(df: pd.DataFrame) -> dict:
    """
    "Incidentes Abertos por Tipo de Alerta" — Ferramenta > Categoria >
    Métrica (3 níveis, colapsáveis) x mês -> contagem, derivados da coluna
    bruta "correlation_display" pelo separador "::" (ex: "ITSI::os:disk::
    system.filesystem.used.pct" -> Ferramenta="ITSI", Categoria="os:disk",
    Métrica="system.filesystem.used.pct"). Só corta nos 2 primeiros "::" —
    qualquer "::" extra (ex: "ELASTIC::network:snmp:get::snmp.DATAPOWER-
    STATUS-MIB::dpStatusCPUUsagetenMinutes.0", confirmado nos dados reais)
    fica tudo junto no nível de Métrica, em vez de abrir um 4º nível.

    Pedido pra complementar "Incidentes Abertos por Source"/"por
    Prioridade" com mais detalhe sobre QUE alerta específico abriu o
    incidente, não só a ferramenta de origem — a própria coluna
    "correlation_display" (mais granular que "Source", que tem lógica
    extra de override por região/atalhos, ver transform.add_keyword_
    columns) é a fonte mais direta pra isto.

    Incidentes sem correlation_display (vazio, nulo, ou o placeholder de
    template por preencher — ver _CORRELATION_JUNK_MARKER) ficam de fora,
    mesma regra de "não contar o que não tem dado" já usada em
    get_source_by_day/_two_level_pivot (confirmado nos dados reais: ~4%
    dos incidentes ficam de fora por isto, os restantes ~96% têm um valor
    utilizável).
    """
    empty = {"months": [], "rows": [], "month_totals": {}, "grand_total": 0}
    if "correlation_display" not in df.columns:
        return empty

    raw = df["correlation_display"].astype(str).str.strip()
    valid = df["correlation_display"].notna() & (raw != "") & ~raw.str.contains(_CORRELATION_JUNK_MARKER, na=False, regex=False)
    subset = df[valid & df["opened_at"].notna()].copy()
    if subset.empty:
        return empty

    parts = subset["correlation_display"].astype(str).str.strip().str.split("::", n=2, expand=True).reindex(columns=[0, 1, 2])
    for i, level in enumerate(["_l1", "_l2", "_l3"]):
        subset[level] = parts[i].where(parts[i].astype(str).str.strip() != "", None)

    subset["_month"] = subset["opened_at"].dt.strftime("%Y-%m")
    months = sorted(subset["_month"].unique())

    rows = _tree_pivot(subset, ["_l1", "_l2", "_l3"], months)
    month_totals = subset.groupby("_month").size()
    return {
        "months": months,
        "rows": rows,
        "month_totals": {m: int(month_totals.get(m, 0)) for m in months},
        "grand_total": int(len(subset)),
    }


def get_aioper_summary(df: pd.DataFrame) -> dict:
    """Dados só do grupo AIOPER: prioridade, ferramentas, e onde o AIOPER se encaixa no total."""
    subset = df[df["Grupo"] == "AIOPER"]
    return {
        "total_incidentes": int(len(subset)),
        "priority_breakdown": get_priority_breakdown(subset),
        "tools_breakdown": get_tools_breakdown(subset, palette=TOOL_COLORS_AI),
        "grupo_breakdown": get_grupo_breakdown(df),
    }
