# services/history_service.py
"""
Consultas históricas/de intervalo de datas. Diferente de cache.py (que só
calcula métricas em cima do fetch mais recente ao ServiceNow), este
módulo lê o SQLite inteiro — linhas "active" (ainda no relatório) +
"backlog" (saíram do relatório porque o ServiceNow expira/purga depois de
um tempo, mas continuam guardadas graças ao UPSERT incremental) — e
permite filtrar por qualquer intervalo real de datas de abertura (um dia,
um mês, vários meses, um ano — o que o filtro do frontend pedir).

Isso é o que dá sustento ao seletor de datas no frontend (Visão Geral /
Report SLAs): sem o armazenamento incremental implementado antes, não
teria como ver dados de períodos cujo incidente já saiu do relatório ao
vivo do ServiceNow.
"""
import sqlite3

import pandas as pd

from cache import DB_PATH
from services import (
    dashboard_service,
    incidents_service,
    major_incs_service,
    operational_activity_service,
    operators_service,
    sla_service,
    team_service,
)
from services.justificacoes_service import parse_justificacoes
from services.transform import (
    enrich_sys_report_template,
    exclude_hidden_technicians,
    exclude_canceled_incidents,
    filter_by_region,
)

GCC_ABERTOS_DATE_COL = "Created"
SLA3_DATE_COL = "Created"
SLA4_DATE_COL = "Start time"
OK_DATE_COL = "Created"

_DEFAULT_SLA3 = {
    "achieved": 0, "not_achieved": 0, "justificados": 0, "sla3_pct": 0.0,
    "target": 70, "target_value": 70, "available": False,
}
_DEFAULT_SLA4 = {
    "sla4_not_achieved": 0, "sla4_count": 0, "sla4_justificados": 0,
    "threshold_minutes": 3, "total_tasks": 0, "is_pending_validation": True, "available": False,
}


def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    cur = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,))
    return cur.fetchone() is not None


def _read_full_table(table_name: str) -> pd.DataFrame | None:
    """Lê a tabela inteira (active + backlog), sem as colunas de controlo."""
    conn = sqlite3.connect(DB_PATH)
    try:
        if not _table_exists(conn, table_name):
            return None
        df = pd.read_sql(f'SELECT * FROM "{table_name}"', conn)
    finally:
        conn.close()
    return df.drop(columns=["_first_seen_at", "_last_seen_at", "_status"], errors="ignore")


def _filter_by_month(df: pd.DataFrame, date_col: str, month: str) -> pd.DataFrame:
    dt = pd.to_datetime(df[date_col], errors="coerce")
    return df[dt.dt.strftime("%Y-%m") == month]


def _filter_by_range(df: pd.DataFrame, date_col: str, start: str, end: str) -> pd.DataFrame:
    """`start`/`end` são datas 'YYYY-MM-DD' inclusive dos dois lados."""
    dt = pd.to_datetime(df[date_col], errors="coerce")
    start_ts = pd.Timestamp(start)
    end_ts = pd.Timestamp(end) + pd.Timedelta(days=1) - pd.Timedelta(seconds=1)
    return df[(dt >= start_ts) & (dt <= end_ts)]


def get_available_months() -> list[str]:
    """Lista de meses (YYYY-MM) com dado real na BD, mais recente primeiro."""
    df = _read_full_table("gcc_abertos")
    if df is None or GCC_ABERTOS_DATE_COL not in df.columns:
        return []
    dt = pd.to_datetime(df[GCC_ABERTOS_DATE_COL], errors="coerce")
    months = dt.dt.strftime("%Y-%m").dropna().unique().tolist()
    return sorted(months, reverse=True)


def get_date_bounds() -> tuple[str, str] | None:
    """
    (data mais antiga, data mais recente) com incidentes reais na BD,
    formato 'YYYY-MM-DD'. Usado pelo slider de intervalo do frontend pra
    saber os limites do eixo. Devolve None se não há histórico ainda.
    """
    df = _read_full_table("gcc_abertos")
    if df is None or GCC_ABERTOS_DATE_COL not in df.columns:
        return None
    dt = pd.to_datetime(df[GCC_ABERTOS_DATE_COL], errors="coerce").dropna()
    if dt.empty:
        return None
    return dt.min().strftime("%Y-%m-%d"), dt.max().strftime("%Y-%m-%d")


def resolve_month(month: str | None) -> str:
    """
    Resolve qual mês usar: o pedido explicitamente (se existir na BD) ou,
    por padrão, o mais recente disponível. Levanta LookupError se não
    houver NENHUM histórico gravado ainda (nenhum ciclo de fetch salvou
    dado na BD).
    """
    months = get_available_months()
    if not months:
        raise LookupError("Sem histórico gravado na base de dados ainda — nenhum ciclo de fetch salvou dado.")
    return month if month in months else months[0]


def _filter_sla4_by_task_set(raw_sla4: pd.DataFrame, enriched_principal: pd.DataFrame) -> pd.DataFrame:
    """
    task_sla_list.do (SLA4) não traz "Parent"/geografia direto — só dá pra
    restringir por região cruzando "Task" com os incidentes de
    `enriched_principal`, que já foi filtrado por geografia (ver
    filter_by_region). Só é chamado quando há um filtro de região ativo
    (região != Global), pra não mudar o comportamento default (sem filtro
    geográfico, SLA4 continua a olhar TODAS as tasks do intervalo, como
    sempre olhou).
    """
    if "Task" not in raw_sla4.columns or "Incidente" not in enriched_principal.columns:
        return raw_sla4
    valid = set(enriched_principal["Incidente"].dropna().astype(str))
    return raw_sla4[raw_sla4["Task"].astype(str).isin(valid)]


def _compute_team_and_operational_activity(
    enriched_principal: pd.DataFrame, raw_ok_filtered: pd.DataFrame | None
) -> tuple[list[dict], dict]:
    """
    Restringe a tabela "ok_" (já filtrada por data) aos incidentes que
    sobreviveram ao filtro de período+região+técnicos ocultos+cancelados
    do principal (ver team_service.filter_ok_by_incident_set — a tabela
    "ok_" não tem região/técnico ocultos próprios) UMA VEZ SÓ, e devolve
    tanto a tabela simples por técnico (team_activity) quanto a análise
    operacional mais rica (por hora/dia da semana/mês/turno/PT-BR — ver
    operational_activity_service.py), que substituiu "Atividade da
    Equipa" em Central Operacional.
    """
    incident_numbers = (
        set(enriched_principal["Incidente"].dropna().astype(str))
        if "Incidente" in enriched_principal.columns
        else set()
    )
    raw_ok_matched = team_service.filter_ok_by_incident_set(raw_ok_filtered, incident_numbers)
    team_activity = team_service.get_team_activity(enriched_principal, raw_ok_matched)
    operational_activity = operational_activity_service.get_operational_activity(enriched_principal, raw_ok_matched)
    return team_activity, operational_activity


def _build_summary(raw_principal: pd.DataFrame, label: dict, raw_justificacoes: pd.DataFrame | None = None) -> dict:
    """
    Núcleo do cálculo, comum a get_monthly_summary/get_range_summary:
    recebe o "gcc_abertos" JÁ FILTRADO (por mês ou por intervalo) e
    devolve o resumo completo. `label` é só metadado devolvido no
    payload (ex: {"month": "2026-08"} ou {"start": ..., "end": ...}).
    `raw_justificacoes`: tabela bruta (Incidente/texto/Aceite?) — ver
    _read_justificacoes_parsed().
    """
    raw_principal = exclude_hidden_technicians(raw_principal, column="Opened by")
    raw_principal = exclude_canceled_incidents(raw_principal, column="State")
    enriched = enrich_sys_report_template(raw_principal, justificacoes=raw_justificacoes)

    result = {
        **label,
        "kpis": dashboard_service.get_kpis(enriched),
        "priority_breakdown": dashboard_service.get_priority_breakdown(enriched),
        "tools_breakdown": dashboard_service.get_tools_breakdown(enriched),
        "tools_sla1_failures": dashboard_service.get_tools_sla1_failures(enriched),
        "incidents_summary": incidents_service.get_incidents_summary(enriched),
        "operators_summary": operators_service.get_operators_summary(enriched),
        "aioper_summary": dashboard_service.get_aioper_summary(enriched),
        "source_by_day": dashboard_service.get_source_by_day(enriched),
    }

    from services import quality_service
    result["quality_metrics"] = quality_service.get_quality_metrics(enriched)
    result["sem_evento_summary"] = quality_service.get_sem_evento_breakdown(enriched)

    sla1_sla2 = dashboard_service.get_sla1_sla2(enriched)
    result["sla1_by_priority"] = dashboard_service.get_sla1_sla2_by_priority(enriched)
    result["_raw_principal_filtered"] = raw_principal  # uso interno (SLA3), removido antes de devolver
    result["_enriched_principal"] = enriched  # uso interno (SLA4 por região), removido antes de devolver
    result["sla1_sla2"] = sla1_sla2

    return result


def get_monthly_summary(month: str, region: str | None = None) -> dict:
    """
    Réplica do que cache.py calcula por ciclo, mas rodando sobre o
    histórico completo da BD filtrado por mês, em vez do fetch mais
    recente. Levanta ValueError se faltar alguma tabela na BD.

    `region` (None/"Global"/"Ibéria"/"Brasil"): filtro geográfico opcional
    (ver transform.filter_by_region), igual ao que existia no dashboard
    antigo — aplicado antes de qualquer cálculo, então TODOS os números
    devolvidos (KPIs, SLA1-4, prioridade, ferramentas...) já refletem só a
    região escolhida.
    """
    raw_principal = _read_full_table("gcc_abertos")
    if raw_principal is None:
        raise ValueError("Tabela 'gcc_abertos' ainda não existe na BD (nenhum ciclo gravou dado ainda).")
    raw_principal = _filter_by_month(raw_principal, GCC_ABERTOS_DATE_COL, month)
    raw_principal = filter_by_region(raw_principal, region)
    raw_justificacoes = _read_full_table("justificacoes")
    justificacoes_parsed = parse_justificacoes(raw_justificacoes)

    result = _build_summary(raw_principal, {"month": month}, raw_justificacoes)
    filtered_principal = result.pop("_raw_principal_filtered")
    enriched_principal = result.pop("_enriched_principal")
    sla1_sla2 = result.pop("sla1_sla2")

    raw_sla3 = _read_full_table("sla3_incidentes")
    sla3 = _DEFAULT_SLA3
    sla3_by_region = {}
    if raw_sla3 is not None:
        raw_sla3 = _filter_by_month(raw_sla3, SLA3_DATE_COL, month)
        raw_sla3 = filter_by_region(raw_sla3, region)
        raw_sla3 = exclude_hidden_technicians(raw_sla3, column="Opened by")
        raw_sla3 = exclude_canceled_incidents(raw_sla3, column="State")
        sla3 = sla_service.get_sla3_summary(raw_sla3, filtered_principal, justificacoes_parsed)
        sla3_by_region = sla_service.get_sla3_by_region(raw_sla3, filtered_principal, justificacoes_parsed)

    raw_sla4 = _read_full_table("sla4")
    sla4 = _DEFAULT_SLA4
    sla4_by_region = {}
    if raw_sla4 is not None:
        raw_sla4 = _filter_by_month(raw_sla4, SLA4_DATE_COL, month)
        if region and region != "Global":
            raw_sla4 = _filter_sla4_by_task_set(raw_sla4, enriched_principal)
        sla4 = sla_service.get_sla4_summary(raw_sla4)
        sla4_by_region = sla_service.get_sla4_by_region(raw_sla4, enriched_principal)

    raw_ok = _read_full_table("ok_")
    if raw_ok is not None:
        raw_ok = _filter_by_month(raw_ok, OK_DATE_COL, month)
    result["team_activity"], result["operational_activity"] = _compute_team_and_operational_activity(enriched_principal, raw_ok)

    result["sla_overview"] = {"sla1": sla1_sla2["sla1"], "sla2": sla1_sla2["sla2"], "sla3": sla3, "sla4": sla4}
    result["sla3_by_region"] = sla3_by_region
    result["sla4_by_region"] = sla4_by_region
    return result


def get_range_summary(start: str, end: str, region: str | None = None) -> dict:
    """
    Igual a get_monthly_summary, mas filtrando por um intervalo de datas
    livre (um dia, várias semanas, vários meses, um ano...) em vez de um
    mês fixo. `start`/`end` são strings 'YYYY-MM-DD', inclusive. `region`
    — ver get_monthly_summary.
    """
    raw_principal = _read_full_table("gcc_abertos")
    if raw_principal is None:
        raise ValueError("Tabela 'gcc_abertos' ainda não existe na BD (nenhum ciclo gravou dado ainda).")
    raw_principal = _filter_by_range(raw_principal, GCC_ABERTOS_DATE_COL, start, end)
    raw_principal = filter_by_region(raw_principal, region)
    raw_justificacoes = _read_full_table("justificacoes")
    justificacoes_parsed = parse_justificacoes(raw_justificacoes)

    result = _build_summary(raw_principal, {"start": start, "end": end}, raw_justificacoes)
    filtered_principal = result.pop("_raw_principal_filtered")
    enriched_principal = result.pop("_enriched_principal")
    sla1_sla2 = result.pop("sla1_sla2")

    raw_sla3 = _read_full_table("sla3_incidentes")
    sla3 = _DEFAULT_SLA3
    sla3_by_region = {}
    if raw_sla3 is not None:
        raw_sla3 = _filter_by_range(raw_sla3, SLA3_DATE_COL, start, end)
        raw_sla3 = filter_by_region(raw_sla3, region)
        raw_sla3 = exclude_hidden_technicians(raw_sla3, column="Opened by")
        raw_sla3 = exclude_canceled_incidents(raw_sla3, column="State")
        sla3 = sla_service.get_sla3_summary(raw_sla3, filtered_principal, justificacoes_parsed)
        sla3_by_region = sla_service.get_sla3_by_region(raw_sla3, filtered_principal, justificacoes_parsed)

    raw_sla4 = _read_full_table("sla4")
    sla4 = _DEFAULT_SLA4
    sla4_by_region = {}
    if raw_sla4 is not None:
        raw_sla4 = _filter_by_range(raw_sla4, SLA4_DATE_COL, start, end)
        if region and region != "Global":
            raw_sla4 = _filter_sla4_by_task_set(raw_sla4, enriched_principal)
        sla4 = sla_service.get_sla4_summary(raw_sla4)
        sla4_by_region = sla_service.get_sla4_by_region(raw_sla4, enriched_principal)

    raw_ok = _read_full_table("ok_")
    if raw_ok is not None:
        raw_ok = _filter_by_range(raw_ok, OK_DATE_COL, start, end)
    result["team_activity"], result["operational_activity"] = _compute_team_and_operational_activity(enriched_principal, raw_ok)

    result["sla_overview"] = {"sla1": sla1_sla2["sla1"], "sla2": sla1_sla2["sla2"], "sla3": sla3, "sla4": sla4}
    result["sla3_by_region"] = sla3_by_region
    result["sla4_by_region"] = sla4_by_region
    return result


def get_incidents_by_status(start: str, end: str, status: str, region: str | None = None) -> list[dict]:
    """
    Lista de incidentes por trás de cada card SLA Cumprido/Falhado/
    Justificado do Report SLAs — usado quando o utilizador clica no card
    (ver quality_service.get_incidents_by_sla_status pra definição exata
    de cada status). Mesmo filtro de intervalo+região dos outros
    endpoints de range, mas devolve as linhas em vez de um resumo.
    """
    raw_principal = _read_full_table("gcc_abertos")
    if raw_principal is None:
        raise ValueError("Tabela 'gcc_abertos' ainda não existe na BD (nenhum ciclo gravou dado ainda).")
    raw_principal = _filter_by_range(raw_principal, GCC_ABERTOS_DATE_COL, start, end)
    raw_principal = filter_by_region(raw_principal, region)
    raw_principal = exclude_hidden_technicians(raw_principal, column="Opened by")
    raw_principal = exclude_canceled_incidents(raw_principal, column="State")
    enriched = enrich_sys_report_template(raw_principal, justificacoes=_read_full_table("justificacoes"))

    from services import quality_service
    return quality_service.get_incidents_by_sla_status(enriched, status)


def get_enriched_gcc_abertos(month: str | None = None, region: str | None = None) -> pd.DataFrame:
    """
    Devolve o DataFrame de "gcc_abertos" (histórico completo: active +
    backlog) já enriquecido, filtrado pro mês resolvido (ver
    resolve_month) e opcionalmente por geografia. Usado pelos endpoints
    que precisam do dado bruto — ex: filtrar por operador individual.
    """
    target_month = resolve_month(month)
    raw_principal = _read_full_table("gcc_abertos")
    if raw_principal is None:
        raise LookupError("Tabela 'gcc_abertos' ainda não existe na BD.")

    raw_principal = _filter_by_month(raw_principal, GCC_ABERTOS_DATE_COL, target_month)
    raw_principal = filter_by_region(raw_principal, region)
    raw_principal = exclude_hidden_technicians(raw_principal, column="Opened by")
    return enrich_sys_report_template(raw_principal, justificacoes=_read_full_table("justificacoes"))


def get_enriched_gcc_abertos_range(start: str, end: str, region: str | None = None) -> pd.DataFrame:
    """Versão por intervalo de get_enriched_gcc_abertos (ver acima)."""
    raw_principal = _read_full_table("gcc_abertos")
    if raw_principal is None:
        raise LookupError("Tabela 'gcc_abertos' ainda não existe na BD.")

    raw_principal = _filter_by_range(raw_principal, GCC_ABERTOS_DATE_COL, start, end)
    raw_principal = filter_by_region(raw_principal, region)
    raw_principal = exclude_hidden_technicians(raw_principal, column="Opened by")
    return enrich_sys_report_template(raw_principal, justificacoes=_read_full_table("justificacoes"))


def get_current_summary(month: str | None = None, region: str | None = None) -> dict:
    """
    Ponto de entrada usado pelos endpoints "sem seletor de mês" (kpis,
    priority, tools, operators, sla, incidents, quality...). Migração
    2026-08: a busca ao vivo ao ServiceNow deixou de alimentar essas
    respostas diretamente — ela só alimenta a BD (via cache.py); TODA
    leitura da API agora vem daqui, do histórico gravado no SQLite.
    Levanta LookupError se ainda não há nenhum ciclo gravado.
    """
    target_month = resolve_month(month)
    return get_monthly_summary(target_month, region=region)


def _month_slices(start: str, end: str) -> list[tuple[str, str, str]]:
    """
    [(rótulo 'YYYY-MM', fatia_start, fatia_end), ...] cobrindo [start,end]
    mês a mês — cada fatia é a interseção desse mês com [start,end], não
    o mês inteiro (ex: se o filtro começa a meio de julho, a fatia de
    julho só conta a partir desse dia). Usado por get_sla_trend pra
    respeitar o período escolhido no filtro em vez de mostrar sempre o
    histórico completo.
    """
    start_ts = pd.Timestamp(start)
    end_ts = pd.Timestamp(end)
    slices = []
    cur = pd.Timestamp(year=start_ts.year, month=start_ts.month, day=1)
    while cur <= end_ts:
        month_end = cur + pd.offsets.MonthEnd(0)
        slice_start = max(cur, start_ts)
        slice_end = min(month_end, end_ts)
        slices.append((cur.strftime("%Y-%m"), slice_start.strftime("%Y-%m-%d"), slice_end.strftime("%Y-%m-%d")))
        cur = cur + pd.DateOffset(months=1)
    return slices


def get_sla_trend(start: str, end: str, region: str | None = None) -> list[dict]:
    """
    SLA1-4 + prioridade + evento, mês a mês, cobrindo só o intervalo
    [start,end] escolhido no filtro de datas (mesma região também) —
    RESOLVIDO 2026-08: antes disto mostrava sempre o histórico completo
    disponível, independente do filtro selecionado; agora respeita
    exatamente o período pedido, quebrado por mês pra dar a tendência
    (cada mês parcialmente dentro do filtro só conta os dias dentro
    dele — ver _month_slices).
    """
    slices = _month_slices(start, end)
    trend = []
    for month, slice_start, slice_end in slices:
        summary = get_range_summary(slice_start, slice_end, region=region)
        overview = summary["sla_overview"]
        quality = summary["quality_metrics"]
        sem_evento = summary["sem_evento_summary"]
        priority = {p["label"]: p["val"] for p in summary["priority_breakdown"]}

        trend.append({
            "month": month,
            # "Sem Justificações" (bruto, sempre foi assim) vs "Com
            # Justificações" (exclui incidentes com justificação aceite
            # pra SLA1 — ver dashboard_service.get_sla1_sla2).
            "sla1_avg_seconds": overview["sla1"]["avg_seconds"],
            "sla1_avg_minutes": round(overview["sla1"]["avg_seconds"] / 60, 1),
            "sla1_avg_minutes_justificado": round(overview["sla1"]["avg_seconds_justificado"] / 60, 1),
            "sla1_avg_time": overview["sla1"]["avg_time"],
            "sla2_pct": overview["sla2"]["pct"],
            "sla2_ok": quality["ok_count"],
            "sla2_nok": quality["nok_count"],
            "sla2_justificados": quality["justificados"],
            "sla2_threshold_count": quality["sla2_threshold_count"],
            "sla3_pct": overview["sla3"]["sla3_pct"],
            "sla3_achieved": overview["sla3"]["achieved"],
            "sla3_not_achieved": overview["sla3"]["not_achieved"],
            "sla3_justificados": overview["sla3"]["justificados"],
            "sla3_threshold_count": overview["sla3"]["threshold_count"],
            "sla4_count": overview["sla4"]["sla4_not_achieved"],
            "com_evento": sem_evento["com_evento_count"],
            "sem_evento": sem_evento["sem_evento_count"],
            "priority_critical": priority.get("Critical", 0),
            "priority_high": priority.get("High", 0),
            "priority_moderate": priority.get("Moderate", 0),
            "priority_low": priority.get("Low", 0),
            "total_incidentes": summary["kpis"]["total_incidentes"],
        })
    return trend


def get_major_incs_summary(start: str, end: str, region: str | None = None) -> dict:
    """
    Página "Major Incs": P1s tratados vs despromovidos (tabela
    "despromovidos", cruzada com "sla3_incidentes" pra confirmar que
    são P1 reais — ver major_incs_service.get_despromovidos_detail) +
    Calls (tabela "calls", ver major_incs_service.get_calls_detail).

    O detalhe de cada incidente despromovido (Date/Canal/Geo/Descrição)
    é cruzado com "gcc_abertos" já filtrado pelo MESMO período/região
    (mesma limitação já aceite pro SLA4-por-região existente, ver
    _filter_sla4_by_task_set): um incidente aberto fora do período mas
    com uma linha de SLA dentro dele aparece só com o número, sem
    detalhe — cruzar com o histórico completo seria mais caro (reverte
    a otimização do enrich_sys_report_template pra todo pedido) pra um
    caso de borda raro.
    """
    raw_principal = _read_full_table("gcc_abertos")
    enriched_principal = None
    if raw_principal is not None:
        raw_principal = _filter_by_range(raw_principal, GCC_ABERTOS_DATE_COL, start, end)
        raw_principal = filter_by_region(raw_principal, region)
        raw_principal = exclude_hidden_technicians(raw_principal, column="Opened by")
        raw_principal = exclude_canceled_incidents(raw_principal, column="State")
        raw_justificacoes = _read_full_table("justificacoes")
        enriched_principal = enrich_sys_report_template(raw_principal, justificacoes=raw_justificacoes)

    raw_despromovidos = _read_full_table("despromovidos")
    raw_sla3 = _read_full_table("sla3_incidentes")
    despromovidos = major_incs_service.get_despromovidos_detail(raw_despromovidos, enriched_principal, raw_sla3, start, end)

    raw_calls = _read_full_table("calls")
    raw_incs_calls_gcc = _read_full_table("incs_calls_gcc")
    calls = major_incs_service.get_calls_detail(raw_calls, raw_incs_calls_gcc, start, end, region)

    return {"start": start, "end": end, "despromovidos": despromovidos, "calls": calls}
