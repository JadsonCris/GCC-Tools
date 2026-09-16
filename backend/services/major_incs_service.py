# services/major_incs_service.py
"""
"Major Incs" — nova view entre AIOPER e Gestão de Turnos: análise de
incidentes P1 (tratados como P1 vs despromovidos) + Calls
(Acompanhamento de Calls), réplica adaptada dos exemplos fornecidos
pelo utilizador (screenshots do dashboard Power BI original).

Duas fontes:
- P1s tratados/despromovidos: "sla3_incidentes" (SLA3_URL = `priority=1`)
  — ver get_despromovidos_detail pra saber porque é esta a fonte certa
  (não o Despromovidos_URL/task_sla_list.do, que foi tentado primeiro e
  descartado por dar falsos positivos).
- Calls: "incs_calls_gcc" (ServiceNow, incidentes com a tag Calls_GCC —
  sinal AUTOMÁTICO, mais fiável) é a população BASE de KPIs/pies/
  tabela/"Total de Calls por dia" — "calls" (SharePoint, Acompanhamento
  de Calls, preenchido à mão) entra por MATCH de número de ticket, só
  pra dar o detalhe que o ServiceNow não tem (Motivo/Estado/nº de
  calls/duração). Pedido explícito do utilizador (2026-08, com
  screenshots reais): "estes cards são pra serem geridos pela tabela
  INCS_CALLS_GCC_URL que podes fazer match com a tabela CALLS_URL".
  JÁ o gráfico "Total de Tempo em Call" é EXCLUSIVAMENTE de "calls" —
  só ela tem as datas de início/fim pra calcular duração real; não
  soma nem zero-preenche a partir de incs_calls_gcc (ver
  get_calls_detail).
"""
import re
from collections import Counter

import pandas as pd

from services import sla_service, team_service


def _range_bounds(start: str, end: str) -> tuple[pd.Timestamp, pd.Timestamp]:
    """(start_ts, end_ts) inclusive dos dois lados — mesma semântica de
    history_service._filter_by_range, reimplementada aqui só pra não
    criar uma dependência cruzada com history_service por causa de 2
    linhas (usada 3x neste ficheiro: despromovidos + as 2 fontes de
    Calls)."""
    return pd.Timestamp(start), pd.Timestamp(end) + pd.Timedelta(days=1) - pd.Timedelta(seconds=1)


def _all_days_between(start: str, end: str) -> list[str]:
    """
    ['YYYY-MM-DD', ...] pra CADA dia entre start/end, inclusive — usado
    pelos gráficos "por dia" (Evolução Diária, Total de Calls, Total de
    Tempo em Call) pra nunca pular dias sem dado.

    RESOLVIDO (pedido do utilizador): antes, esses gráficos só listavam
    os dias que TINHAM pelo menos um registo (ex: "25, 27, 30, 1, 2, 8,
    15..."), com espaçamento no eixo X que parecia contínuo mas não era
    — um dia sem incidentes/calls simplesmente não aparecia, em vez de
    aparecer com valor 0. Agora a lista de dias vem sempre do próprio
    período pedido, não dos dados encontrados.
    """
    return [d.strftime("%Y-%m-%d") for d in pd.date_range(pd.Timestamp(start), pd.Timestamp(end), freq="D")]

# Cores por "Prioridade (se aplicável)" — quando em branco (Change/Problem,
# que não têm prioridade), cai no próprio "Tipo" como categoria (ver
# _priority_or_type abaixo). Mesma paleta de vermelho/laranja/amarelo/azul
# usada no resto da app (dashboard_service.PRIORITY_COLORS), + 2 cores
# extra pras categorias sem prioridade.
CALL_CATEGORY_COLORS = {
    "P1": "#E21B23", "P2": "#FAB138", "P3": "#F9E33B", "P4": "#30ADDE",
    "Change": "#2B6CB0", "Problem": "#212E3E",
}


def _incident_detail_rows(task_numbers, df_gcc_abertos_enriched: pd.DataFrame | None, fallback_detail: dict | None = None) -> list[dict]:
    """
    Junta cada número de incidente (de sla3_incidentes — ver
    get_despromovidos_detail) com o detalhe em GCC Abertos já
    enriquecido (Date/Canal/Geo/Descrição). A maioria desses incidentes
    nem é de origem GCC, então não batem em GCC Abertos — mas
    `fallback_detail` (RESOLVIDO 2026-09, pedido do utilizador: "na BD
    estão lá os dados necessários") já traz Date/Geo/Descrição
    diretamente de sla3_incidentes (que tem "Short description" e
    "Parent" próprios, sem precisar do match) pra quem não bate. Só
    "Canal" fica sempre em branco pra quem não bate — vem de "Channel"/
    contact_type, campo que o SLA3_URL não pede (só o PRINCIPAL_URL,
    origem GCC, pede).
    """
    if df_gcc_abertos_enriched is not None and not df_gcc_abertos_enriched.empty and "Incidente" in df_gcc_abertos_enriched.columns:
        lookup = df_gcc_abertos_enriched.drop_duplicates(subset="Incidente").set_index("Incidente")
    else:
        lookup = pd.DataFrame()
    fallback_detail = fallback_detail or {}

    rows = []
    for number in task_numbers:
        fb = fallback_detail.get(number, {})
        if number in lookup.index:
            row = lookup.loc[number]
            opened_at = row.get("opened_at")
            rows.append({
                "number": number,
                "date": opened_at.strftime("%Y-%m-%d") if pd.notna(opened_at) else fb.get("date"),
                "canal": row.get("channel") or None,
                "geo": row.get("Column Measure") or fb.get("geo"),
                "short_description": row.get("short_description") or fb.get("short_description") or "",
            })
        else:
            rows.append({
                "number": number,
                "date": fb.get("date"),
                "canal": None,
                "geo": fb.get("geo"),
                "short_description": fb.get("short_description") or "",
            })
    rows.sort(key=lambda r: r["date"] or "", reverse=True)
    return rows


def _daily_counts(rows_a: list[dict], rows_b: list[dict], label_a: str, label_b: str, start: str, end: str) -> list[dict]:
    """[{date, <label_a>: N, <label_b>: M}, ...] pra CADA dia de [start,end] (ver _all_days_between), não só os que têm dado."""
    count_a = Counter(r["date"] for r in rows_a if r["date"])
    count_b = Counter(r["date"] for r in rows_b if r["date"])
    return [{"date": d, label_a: count_a.get(d, 0), label_b: count_b.get(d, 0)} for d in _all_days_between(start, end)]


def get_despromovidos_detail(
    sla3_status_by_number: dict[str, str],
    df_gcc_abertos_enriched: pd.DataFrame | None,
    df_sla3_raw: pd.DataFrame | None,
    df_despromovidos_raw: pd.DataFrame | None,
    start: str,
    end: str,
) -> dict:
    """
    "Total de Incidentes Tratados Como P1" (ainda é priority=1 agora) vs
    "Total de Incidentes Abertos Como P1 Que Foram Despromovidos" (já não
    é priority=1).

    RESOLVIDO 2026-08 (feedback do utilizador, cross-check manual): a
    população BASE (quem conta como "P1 real" no período, pela data de
    abertura) vem de "sla3_incidentes" (SLA3_URL, `priority=1` — o campo
    REAL de prioridade), não do Despromovidos_URL (task_sla_list.do,
    filtrado por SLA cujo NOME menciona "P1"/"Nível 1" — nome de SLA é só
    convenção de texto, dava falso positivo).

    RESOLVIDO 2026-09 (bug real, com caso concreto confirmado pelo
    utilizador): a versão anterior tentava descobrir QUEM foi
    despromovido reconstruindo a cronologia de prioridade de cada task a
    partir do Despromovidos_URL (1ª linha por "start_time" = P1, alguma
    linha seguinte de prioridade diferente = despromovido). Dois
    problemas reais:
    1. O ServiceNow por vezes REMOVE linhas antigas desse histórico
       (fora do nosso controlo) — um P1 nunca despromovido podia
       desaparecer da tabela por completo, subcontando o total.
    2. O filtro do Despromovidos_URL (SLA cujo NOME tem "P1"/"Nível 1" OU
       criada por alguém da equipa) dá uma vista PARCIAL da história de
       cada task — pode faltar a linha inicial genuína e/ou a linha
       final, então a "primeira" linha que vemos pode não ser a primeira
       real. Caso confirmado: INC0055713 passou por P3+P4 -> P1-Citrix ->
       P2-Citrix -> Nível 2 -> Nível 1 (5 linhas reais, terminou como P1
       — "Priority: 1 - Critical" no ServiceNow), mas o nosso filtro só
       via 3 dessas linhas (falta a P3+P4 inicial e a Nível 2) — via
       "P1-Citrix" como se fosse a primeira, via "P2-Citrix" a seguir, e
       concluía "despromovido" — falso positivo, ignorando que a task
       voltou a P1 no fim.

    Corrigido: a CLASSIFICAÇÃO usa o sinal que já temos e É fiável —
    `sla3_status_by_number` (o "_status" da própria linha em
    sla3_incidentes, {Number: "active"|"backlog"}). SLA3_URL não tem
    filtro de estado, só `priority=1`; a cada ciclo de fetch, quem AINDA
    é priority=1 fica "active" e quem deixou de ser passa a "backlog"
    (via UPSERT incremental) — a definição exata de "despromovido", sem
    precisar reconstruir história nenhuma nem depender de o
    Despromovidos_URL ter a linha certa.

    RESOLVIDO 2026-09 (pedido do utilizador): `df_despromovidos_raw`
    voltou a ser usado, mas só pra ANOTAR pra que prioridade cada
    despromovido efetivamente desceu ("despromovido_para": "P2"/"P3"/
    "P4") — a última linha de SLA por "start_time", ver
    cache._build_despromovidos_url (RESOLVIDO junto: passou a filtrar
    por `task.numberIN<números de sla3_incidentes>`, história completa
    de cada task, em vez do filtro por autor/nome de SLA que dava a
    vista parcial do bug acima). Não decide classificação nenhuma —
    só decora a lista já decidida pelo `_status`.
    """
    empty = {
        "tratados_count": 0, "despromovidos_count": 0,
        "tratados": [], "despromovidos": [], "daily": [],
    }
    if df_sla3_raw is None or df_sla3_raw.empty or "Number" not in df_sla3_raw.columns or "Created" not in df_sla3_raw.columns:
        return empty

    start_ts, end_ts = _range_bounds(start, end)
    sla3_created = pd.to_datetime(df_sla3_raw["Created"], errors="coerce")
    sla3_in_range = df_sla3_raw[(sla3_created >= start_ts) & (sla3_created <= end_ts)].copy()
    if sla3_in_range.empty:
        return empty
    sla3_in_range["Number"] = sla3_in_range["Number"].dropna().astype(str)
    confirmed_p1 = set(sla3_in_range["Number"])

    # Fallback de Date/Geo/Descrição pra quem não bate em GCC Abertos
    # (incidente sem origem GCC) — sla3_incidentes já tem "Created",
    # "Parent" e "Short description" próprios, não precisa do match pra
    # ter esse detalhe (só "Canal"/Channel fica mesmo em branco, ver
    # _incident_detail_rows).
    created_dt = pd.to_datetime(sla3_in_range["Created"], errors="coerce")
    has_short_desc = "Short description" in sla3_in_range.columns
    fallback_detail = {}
    for num, created, parent, short_desc in zip(
        sla3_in_range["Number"],
        created_dt,
        sla3_in_range["Parent"] if "Parent" in sla3_in_range.columns else [None] * len(sla3_in_range),
        sla3_in_range["Short description"] if has_short_desc else [None] * len(sla3_in_range),
    ):
        fallback_detail[num] = {
            "date": created.strftime("%Y-%m-%d") if pd.notna(created) else None,
            "geo": _region_of(parent) if parent is not None else None,
            "short_description": short_desc if pd.notna(short_desc) else None,
        }

    # "active" (ou sem entrada no mapa, ex: BD antiga sem essa coluna
    # ainda) = continua P1 = tratado; qualquer outro valor de "_status"
    # (na prática só "backlog") = já não é P1 = despromovido.
    bad_tasks = {num for num in confirmed_p1 if sla3_status_by_number.get(num, "active") != "active"}
    tratados_tasks = confirmed_p1 - bad_tasks

    tratados_rows = _incident_detail_rows(sorted(tratados_tasks), df_gcc_abertos_enriched, fallback_detail)
    despromovidos_rows = _incident_detail_rows(sorted(bad_tasks), df_gcc_abertos_enriched, fallback_detail)

    # "despromovido_para": última prioridade vista na história de SLA da
    # task (mais recente por "start_time") — só uma anotação, ver
    # docstring acima. None se a task não bater no Despromovidos_URL por
    # algum motivo (ex: ciclo de atraso em _all_known_p1_numbers).
    if df_despromovidos_raw is not None and not df_despromovidos_raw.empty and bad_tasks:
        prepared = sla_service.prepare_sla_rows(df_despromovidos_raw)
        d = prepared.dropna(subset=["_priority", "start_time"]) if "_priority" in prepared.columns and "start_time" in prepared.columns else prepared.iloc[0:0]
        if not d.empty:
            d = d.sort_values(["task", "start_time"], kind="stable")
            last_priority = d.groupby("task")["_priority"].last()
            despromovido_para = {task: f"P{int(p)}" for task, p in last_priority.items() if pd.notna(p)}
            for row in despromovidos_rows:
                row["despromovido_para"] = despromovido_para.get(row["number"])
    for row in despromovidos_rows:
        row.setdefault("despromovido_para", None)

    return {
        "tratados_count": len(tratados_rows),
        "despromovidos_count": len(despromovidos_rows),
        "tratados": tratados_rows,
        "despromovidos": despromovidos_rows,
        "daily": _daily_counts(tratados_rows, despromovidos_rows, "tratados", "despromovidos", start, end),
    }


def _priority_or_type(df: pd.DataFrame) -> pd.Series:
    """
    "Prioridade (se aplicável)" só existe pra linhas Tipo="Incidente"
    (P1/P2/P3/P4) — Change/Problem ficam em branco nesse campo (dados
    reais confirmados: 18 valores em branco = exatamente os 17 Change +
    1 Problem). Cai no "Tipo" nesses casos, pra cada linha ter sempre
    uma categoria (mesmo comportamento visto no pie "Prioridade" do
    dashboard original, que mistura P1-P4 com Change/Problem).
    """
    prioridade = df["Prioridade (se aplicável)"] if "Prioridade (se aplicável)" in df.columns else pd.Series(pd.NA, index=df.index)
    tipo = df["Tipo"] if "Tipo" in df.columns else pd.Series(pd.NA, index=df.index)
    return prioridade.fillna(tipo)


def _fmt_hms(total_seconds: float) -> str:
    total_seconds = max(0, int(total_seconds or 0))
    h, rem = divmod(total_seconds, 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def _region_of(parent_value) -> str:
    """Mesma regra de transform.add_region_column, aplicada ao campo bruto "Parent" de incs_calls_gcc."""
    return "Brasil" if "BRASIL" in str(parent_value or "").upper() else "Ibéria"


_PRIORITY_SHORT = {"1": "P1", "2": "P2", "3": "P3", "4": "P4"}


def _priority_short(raw_priority) -> str | None:
    """"1 - Critical" -> "P1" (formato de incs_calls_gcc, convertido pro mesmo formato curto da "calls")."""
    if not raw_priority or pd.isna(raw_priority):
        return None
    m = re.match(r"\s*(\d)", str(raw_priority))
    return _PRIORITY_SHORT.get(m.group(1)) if m else None


def _tickets_from_calls_table(df_calls_raw: pd.DataFrame | None, start: str, end: str, region: str | None) -> dict[str, dict]:
    """
    {número: {calls, duracao_seg, date, geo, prioridade, motivo, tipo}}
    a partir da folha SharePoint (pode ter várias linhas por ticket —
    "calls" agrega quantas vezes esse incidente teve uma call major
    registada, "duracao_seg" soma o tempo de todas).
    """
    if df_calls_raw is None or df_calls_raw.empty or "Id de ticket" not in df_calls_raw.columns:
        return {}

    df = df_calls_raw.copy()
    df["_inicio"] = pd.to_datetime(df["Data de Inicio"].astype(str).str.strip(), dayfirst=True, errors="coerce")
    df["_fim"] = pd.to_datetime(df["Data de Fim"].astype(str).str.strip(), dayfirst=True, errors="coerce")

    start_ts, end_ts = _range_bounds(start, end)
    df = df[df["_inicio"].notna() & (df["_inicio"] >= start_ts) & (df["_inicio"] <= end_ts)]

    if region and region != "Global" and "Geografia" in df.columns:
        is_brasil = df["Geografia"].astype(str).str.upper().str.contains("BRASIL", na=False)
        df = df[is_brasil] if region == "Brasil" else df[~is_brasil]

    if df.empty:
        return {}

    df["_categoria"] = _priority_or_type(df)
    df["_duracao_seg"] = (df["_fim"] - df["_inicio"]).dt.total_seconds().clip(lower=0).fillna(0)

    tickets: dict[str, dict] = {}
    for row in df.to_dict(orient="records"):
        ticket = row.get("Id de ticket")
        if not ticket or pd.isna(ticket):
            continue
        ticket = str(ticket)
        entry = tickets.setdefault(ticket, {
            "calls": 0, "duracao_seg": 0.0, "date": None,
            "geo": None, "prioridade": None, "motivo": None, "tipo": None,
        })
        entry["calls"] += 1
        entry["duracao_seg"] += row["_duracao_seg"]
        inicio = row["_inicio"]
        if entry["date"] is None and pd.notna(inicio):
            entry["date"] = inicio.strftime("%Y-%m-%d")
        entry["geo"] = entry["geo"] or row.get("Geografia")
        entry["prioridade"] = entry["prioridade"] or row.get("_categoria")
        entry["motivo"] = entry["motivo"] or row.get("Motivo")
        entry["tipo"] = entry["tipo"] or row.get("Estado")
    return tickets


def _tickets_from_incs_calls_gcc(df_incs_raw: pd.DataFrame | None, start: str, end: str, region: str | None) -> dict[str, dict]:
    """
    {número: {date, geo, prioridade, short_description}} a partir de
    "incs_calls_gcc" (ServiceNow, tag Calls_GCC) — sinal automático de
    QUAIS incidentes tiveram call major, independente de terem sido
    registados na folha SharePoint ou não.
    """
    if df_incs_raw is None or df_incs_raw.empty or "Number" not in df_incs_raw.columns:
        return {}

    df = df_incs_raw.copy()
    df["_created"] = pd.to_datetime(df["Created"], errors="coerce")
    start_ts, end_ts = _range_bounds(start, end)
    df = df[df["_created"].notna() & (df["_created"] >= start_ts) & (df["_created"] <= end_ts)]

    if "Parent" in df.columns:
        df["_geo"] = df["Parent"].apply(_region_of)
        if region and region != "Global":
            df = df[df["_geo"] == region]
    else:
        df["_geo"] = None

    tickets: dict[str, dict] = {}
    for row in df.to_dict(orient="records"):
        number = row.get("Number")
        if not number or pd.isna(number):
            continue
        tickets[str(number)] = {
            "date": row["_created"].strftime("%Y-%m-%d") if pd.notna(row["_created"]) else None,
            "geo": row.get("_geo"),
            "prioridade": _priority_short(row.get("Priority")),
            "short_description": row.get("Short description") or "",
        }
    return tickets


def get_calls_detail(
    df_calls_raw: pd.DataFrame | None,
    df_incs_calls_gcc_raw: pd.DataFrame | None,
    start: str,
    end: str,
    region: str | None = None,
) -> dict:
    """
    RESOLVIDO 2026-08 (feedback do utilizador com screenshots reais):
    KPIs/pies/"Total de Calls por dia" são DIRIGIDOS por
    "incs_calls_gcc" (ServiceNow, sinal automático de quais incidentes
    têm a tag Calls_GCC — a população base), com "calls" (SharePoint)
    dando o MATCH por número de ticket pro detalhe que só existe lá
    (Motivo/Estado). Um ticket sem entrada na folha continua a contar
    pra "Total de Calls"/pies, só com esse detalhe em branco.

    JÁ o gráfico "Total de Tempo em Call" (por dia) é EXCLUSIVAMENTE da
    folha "calls" — é a ÚNICA fonte com "Data de Inicio"/"Data de Fim"
    pra calcular duração real; NÃO usa incs_calls_gcc pra nada (nem
    zero-preenche tickets sem match, que antes criavam uma cauda de
    pontos "00:00:00" no gráfico).
    """
    empty = {
        "total_calls": 0, "total_tempo": "00:00:00",
        "geografia": [], "prioridade": [], "motivo": [], "tipo": [],
        "daily_calls": [], "daily_duracao": [],
        "priority_keys": [],
    }

    calls_tickets = _tickets_from_calls_table(df_calls_raw, start, end, region)
    incs_tickets = _tickets_from_incs_calls_gcc(df_incs_calls_gcc_raw, start, end, region)
    if not incs_tickets:
        return empty

    merged: dict[str, dict] = {}
    for number, i in incs_tickets.items():
        c = calls_tickets.get(number, {})
        merged[number] = {
            "date": i.get("date") or c.get("date"),
            "geo": i.get("geo") or c.get("geo"),
            "prioridade": i.get("prioridade") or c.get("prioridade"),
            "motivo": c.get("motivo"),
            "tipo": c.get("tipo"),
        }

    geografia_counts = Counter(t["geo"] for t in merged.values() if t["geo"])
    prioridade_counts = Counter(t["prioridade"] for t in merged.values() if t["prioridade"])
    motivo_counts = Counter(t["motivo"] for t in merged.values() if t["motivo"])
    tipo_counts = Counter(t["tipo"] for t in merged.values() if t["tipo"])

    priority_keys = sorted(
        prioridade_counts.keys(),
        key=lambda k: list(CALL_CATEGORY_COLORS.keys()).index(k) if k in CALL_CATEGORY_COLORS else 99,
    )
    daily_calls_counter: dict[str, Counter] = {}
    for t in merged.values():
        if not t["date"]:
            continue
        daily_calls_counter.setdefault(t["date"], Counter())[t["prioridade"] or "?"] += 1
    # RESOLVIDO (pedido do utilizador): itera _all_days_between (o
    # período pedido), não só os dias com pelo menos uma call — um dia
    # sem calls entra com 0 em vez de simplesmente não aparecer no eixo.
    daily_calls = [
        {"date": day, **{k: daily_calls_counter.get(day, Counter()).get(k, 0) for k in priority_keys}}
        for day in _all_days_between(start, end)
    ]

    # "Total de Tempo em Call": exclusivamente calls_tickets (ver docstring).
    daily_duracao_map: dict[str, float] = {}
    for t in calls_tickets.values():
        if not t["date"]:
            continue
        daily_duracao_map[t["date"]] = daily_duracao_map.get(t["date"], 0.0) + t["duracao_seg"]
    daily_duracao_rows = [
        {"date": day, "segundos": int(daily_duracao_map.get(day, 0.0)), "tempo": _fmt_hms(daily_duracao_map.get(day, 0.0))}
        for day in _all_days_between(start, end)
    ]
    total_seg = sum(t["duracao_seg"] for t in calls_tickets.values())

    return {
        "total_calls": len(merged),
        "total_tempo": _fmt_hms(total_seg),
        "geografia": [{"label": k, "val": v} for k, v in geografia_counts.most_common()],
        "prioridade": [{"label": k, "val": v} for k, v in prioridade_counts.most_common()],
        "motivo": [{"label": k, "val": v} for k, v in motivo_counts.most_common()],
        "tipo": [{"label": k, "val": v} for k, v in tipo_counts.most_common()],
        "daily_calls": daily_calls,
        "daily_duracao": daily_duracao_rows,
        "priority_keys": priority_keys,
    }
