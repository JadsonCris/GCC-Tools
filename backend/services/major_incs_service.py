# services/major_incs_service.py
"""
"Major Incs" — nova view entre AIOPER e Gestão de Turnos: análise de
incidentes P1 (tratados como P1 vs despromovidos) + Calls
(Acompanhamento de Calls), réplica adaptada dos exemplos fornecidos
pelo utilizador (screenshots do dashboard Power BI original).

Duas fontes:
- "despromovidos" (task_sla_list.do, filtrado por AUTOR da SLA — ver
  cache._build_despromovidos_url, montada dinamicamente a partir de
  team_service.USUARIOS): mesmo shape de "sla4", reaproveita
  sla_service.prepare_sla_rows/get_p1_task_sets. Um "Task" (=número do
  incidente) entra em p1_tasks se a PRIMEIRA linha de SLA é P1; entra
  também em bad_tasks (despromovido) se alguma linha seguinte é de
  prioridade diferente. "Tratados como P1" = p1_tasks - bad_tasks.
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

# Cores por "Prioridade (se aplicável)" — quando em branco (Change/Problem,
# que não têm prioridade), cai no próprio "Tipo" como categoria (ver
# _priority_or_type abaixo). Mesma paleta de vermelho/laranja/amarelo/azul
# usada no resto da app (dashboard_service.PRIORITY_COLORS), + 2 cores
# extra pras categorias sem prioridade.
CALL_CATEGORY_COLORS = {
    "P1": "#E21B23", "P2": "#FAB138", "P3": "#F9E33B", "P4": "#30ADDE",
    "Change": "#2B6CB0", "Problem": "#212E3E",
}


def _incident_detail_rows(task_numbers, df_gcc_abertos_enriched: pd.DataFrame | None, fallback_dates: dict | None = None) -> list[dict]:
    """
    Junta cada número de incidente (Task) com o detalhe em GCC Abertos
    já enriquecido (Date/Canal/Geo/Descrição). A busca de Despromovidos
    agora inclui qualquer linha de SLA que mencione P1/Nível 1
    (independente de quem criou — ver cache._build_despromovidos_url),
    não só as da nossa equipa — a maioria desses incidentes nem é de
    origem GCC, então não batem em GCC Abertos (confirmado com dados
    reais: só ~1 em 7 bate). Quem não bate aparece só com o número
    (resto em branco) em vez de ser descartado, pra não sub-contar o
    total — MAS a "Date" ainda usa `fallback_dates` (Created/Start time
    da própria linha de SLA) quando não há match, pra pelo menos a
    Evolução Diária continuar a ter dado real em vez de ficar vazia.
    """
    if df_gcc_abertos_enriched is not None and not df_gcc_abertos_enriched.empty and "Incidente" in df_gcc_abertos_enriched.columns:
        lookup = df_gcc_abertos_enriched.drop_duplicates(subset="Incidente").set_index("Incidente")
    else:
        lookup = pd.DataFrame()
    fallback_dates = fallback_dates or {}

    rows = []
    for number in task_numbers:
        if number in lookup.index:
            row = lookup.loc[number]
            opened_at = row.get("opened_at")
            rows.append({
                "number": number,
                "date": opened_at.strftime("%Y-%m-%d") if pd.notna(opened_at) else fallback_dates.get(number),
                "canal": row.get("channel") or None,
                "geo": row.get("Column Measure") or None,
                "short_description": row.get("short_description") or "",
            })
        else:
            rows.append({"number": number, "date": fallback_dates.get(number), "canal": None, "geo": None, "short_description": ""})
    rows.sort(key=lambda r: r["date"] or "", reverse=True)
    return rows


def _daily_counts(rows_a: list[dict], rows_b: list[dict], label_a: str, label_b: str) -> list[dict]:
    """[{date, <label_a>: N, <label_b>: M}, ...], só dias com dado real de pelo menos uma série, ordenado."""
    count_a = Counter(r["date"] for r in rows_a if r["date"])
    count_b = Counter(r["date"] for r in rows_b if r["date"])
    all_days = sorted(set(count_a) | set(count_b))
    return [{"date": d, label_a: count_a.get(d, 0), label_b: count_b.get(d, 0)} for d in all_days]


def get_despromovidos_detail(
    df_despromovidos_raw: pd.DataFrame | None,
    df_gcc_abertos_enriched: pd.DataFrame | None,
    df_sla3_raw: pd.DataFrame | None,
    start: str,
    end: str,
) -> dict:
    """
    "Total de Incidentes Tratados Como P1" (abriu P1, nunca mudou) vs
    "Total de Incidentes Abertos Como P1 Que Foram Despromovidos" (abriu
    P1, mudou de prioridade depois) — ver get_p1_task_sets pra lógica
    exata. Filtra as linhas de SLA por "start_time" dentro de
    [start,end] antes de agrupar por task (mesmo critério já usado pro
    SLA4 em history_service.py).

    RESOLVIDO 2026-08 (feedback do utilizador, cross-check manual): a
    query mais abrangente do Despromovidos_URL (ver cache._build_
    despromovidos_url) traz QUALQUER SLA cujo NOME mencione "P1"/"Nível
    1" — mas o nome de uma SLA é só uma convenção de texto, não o campo
    real de prioridade do incidente, e pode dar falso positivo (task
    cuja PRIMEIRA linha visível no nosso recorte é uma SLA "P1", mas
    que na realidade nunca foi prioridade 1 — só não vimos a(s) linha(s)
    anterior(es) reais porque não batem no filtro da query). Confirmado
    com dados reais: de 24 candidatos detetados, só 2 batiam em
    "sla3_incidentes" (SLA3_URL, `priority=1` — o campo REAL de
    prioridade do incidente, não o nome da SLA). Por isso agora só
    conta como "tratado"/"despromovido" quem também aparece em
    sla3_incidentes (histórico completo, active+backlog — um incidente
    despromovido já não é priority=1 HOJE, mas continua na tabela como
    "backlog" graças ao UPSERT incremental, então esta validação
    funciona mesmo depois da despromoção).
    """
    empty = {
        "tratados_count": 0, "despromovidos_count": 0,
        "tratados": [], "despromovidos": [], "daily": [],
    }
    if df_despromovidos_raw is None or df_despromovidos_raw.empty:
        return empty

    prepared = sla_service.prepare_sla_rows(df_despromovidos_raw)
    if "start_time" not in prepared.columns:
        return empty

    start_ts = pd.Timestamp(start)
    end_ts = pd.Timestamp(end) + pd.Timedelta(days=1) - pd.Timedelta(seconds=1)
    prepared = prepared[(prepared["start_time"] >= start_ts) & (prepared["start_time"] <= end_ts)]

    p1_tasks, bad_tasks = sla_service.get_p1_task_sets(prepared)
    tratados_tasks = p1_tasks - bad_tasks

    confirmed_p1 = (
        set(df_sla3_raw["Number"].dropna().astype(str))
        if df_sla3_raw is not None and not df_sla3_raw.empty and "Number" in df_sla3_raw.columns
        else set()
    )
    tratados_tasks &= confirmed_p1
    bad_tasks &= confirmed_p1

    # Data mais antiga (1ª linha de SLA, a P1 original) por task — usada
    # como fallback de "Date" pra incidentes que não batem em GCC Abertos.
    fallback_dates = {
        task: ts.strftime("%Y-%m-%d")
        for task, ts in prepared.groupby("task")["start_time"].min().items()
        if pd.notna(ts)
    }

    tratados_rows = _incident_detail_rows(sorted(tratados_tasks), df_gcc_abertos_enriched, fallback_dates)
    despromovidos_rows = _incident_detail_rows(sorted(bad_tasks), df_gcc_abertos_enriched, fallback_dates)

    return {
        "tratados_count": len(tratados_rows),
        "despromovidos_count": len(despromovidos_rows),
        "tratados": tratados_rows,
        "despromovidos": despromovidos_rows,
        "daily": _daily_counts(tratados_rows, despromovidos_rows, "tratados", "despromovidos"),
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

    start_ts = pd.Timestamp(start)
    end_ts = pd.Timestamp(end) + pd.Timedelta(days=1) - pd.Timedelta(seconds=1)
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
    start_ts = pd.Timestamp(start)
    end_ts = pd.Timestamp(end) + pd.Timedelta(days=1) - pd.Timedelta(seconds=1)
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
    daily_calls = [
        {"date": day, **{k: daily_calls_counter[day].get(k, 0) for k in priority_keys}}
        for day in sorted(daily_calls_counter)
    ]

    # "Total de Tempo em Call": exclusivamente calls_tickets (ver docstring).
    daily_duracao_map: dict[str, float] = {}
    for t in calls_tickets.values():
        if not t["date"]:
            continue
        daily_duracao_map[t["date"]] = daily_duracao_map.get(t["date"], 0.0) + t["duracao_seg"]
    daily_duracao_rows = [
        {"date": day, "segundos": int(seg), "tempo": _fmt_hms(seg)}
        for day, seg in sorted(daily_duracao_map.items())
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
