# services/operational_activity_service.py
"""
Análise de atividade operacional (abertos vs resolvidos vs CI's) por hora
do dia, dia da semana, mês e turno — adaptado do protótipo HTML "análise
de incidentes" (upload manual de CSV/XLSX) fornecido pelo utilizador, mas
consumindo os dados reais já carregados na BD (gcc_abertos + ok_ + cis)
em vez de ficheiros carregados à mão. Alimenta a secção "Atividade
Operacional" de Central Operacional (substituiu a antiga tabela
"Atividade da Equipa").

Definições confirmadas com o utilizador:
- "incidentes abertos" = todos os incidentes cujo "Técnico" (coluna
  "Opened by" já enriquecida) é o operador.
- "incidentes resolvidos" = todas as tags "OK_GCC" feitas pelo operador
  (tabela "ok_", coluna "Created by") — a tag manual de conclusão que a
  equipa já usa, NÃO o estado "Closed" do incidente.
- "CI's" (migração v20 do protótipo) = Configuration Items que o
  operador anexou a um incidente (tabela "cis", ver services/ci_service.py)
  — sinal de quem faz o trabalho de documentação/CMDB atrás de cada
  incidente, incluindo os abertos automaticamente pelo bot AIOPS.

PT/BR: agrupamento pra estes gráficos, baseado em onde a PESSOA está
sediada (geografia da equipa) — nada a ver com "Column Measure"
(Ibéria/Brasil, geografia do CLIENTE afetado, usada no resto da app).
A equipa de cada pessoa vive agora só em team_service (tabela
team_members, coluna `team`) — RESOLVIDO: antes disto, uma cópia local
(TEAM_PT/TEAM_BR) desatualizada tinha 4 pessoas em falta, que caíam
incorretamente em "Sem equipa"; ver team_service.py pra unificação.

Turnos reais por equipa (migração v20, RESOLVIDO): antes disto, toda a
gente (equipa PT, BR ou sem equipa) era classificada pelos mesmos limites
genéricos Manhã 09-17/Tarde 17-01/Noite 01-09. O ficheiro v20 confirma que
PT e BR têm horários de turno DIFERENTES entre si (SHIFT_DEFS) — a
fronteira de classificação usa a hora de INÍCIO de cada turno da equipa
da pessoa (ver shift_label_for). Quem não tem equipa atribuída
(liderança, bot AIOPS) continua a usar o limite genérico como fallback,
por não ter horário de turno formal.
"""
import pandas as pd

from services import team_service

WEEKDAYS_PT = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]
TURNOS = ("Manhã", "Tarde", "Noite")

# Hora de início (minutos desde 00:00) de cada turno, por equipa —
# confirmado no ficheiro v20 (SHIFT_DEFS). A ordem aqui não importa,
# _shift_label_for ordena internamente pela hora de início.
SHIFT_STARTS = {
    "PT": [("Manhã", 7 * 60), ("Tarde", 15 * 60), ("Noite", 23 * 60)],
    "BR": [("Manhã", 9 * 60 + 30), ("Tarde", 17 * 60 + 30), ("Noite", 1 * 60 + 30)],
}


def team_of(tecnico: str, lookup: dict[str, str] | None = None) -> str:
    """`lookup` opcional (team_service.team_by_name(), pré-carregado uma
    vez) evita uma query à BD por chamada — sempre passar quando usado
    dentro de um `.apply()`/loop sobre muitas linhas (ver
    _with_shift_column/_team_breakdown abaixo)."""
    return team_service.team_of_name(tecnico, lookup)


def _generic_period_of(hour: int) -> str:
    """Fallback pra quem não tem equipa (turno formal) atribuída — mesmo
    limite genérico usado antes desta migração pra toda a gente."""
    if 9 <= hour < 17:
        return "Manhã"
    if hour >= 17 or hour < 1:
        return "Tarde"
    return "Noite"


def shift_label_for(team: str, minutes_of_day: int) -> str:
    """
    Classifica a hora do dia (minutos desde 00:00) no turno real da
    equipa (PT/BR) — réplica de shiftOfDate() do ficheiro v20: ordena os
    3 turnos da equipa pela hora de início e escolhe o último cujo início
    já passou (com "wrap" pra depois da meia-noite, tratado pelo default
    = último turno da lista ordenada). Sem equipa (team="-") cai no
    fallback genérico.
    """
    starts = SHIFT_STARTS.get(team)
    if not starts:
        return _generic_period_of(minutes_of_day // 60)
    ordered = sorted(starts, key=lambda x: x[1])
    chosen = ordered[-1][0]
    for i, (label, start) in enumerate(ordered):
        next_start = ordered[i + 1][1] if i + 1 < len(ordered) else 24 * 60
        if start <= minutes_of_day < next_start:
            chosen = label
            break
    return chosen


def _with_shift_column(events: pd.DataFrame) -> pd.DataFrame:
    """Adiciona as colunas "shift" (turno real, por equipa do operador),
    "day_str"/"month_str" (strftime já pronto) a um DataFrame de eventos
    já com "tecnico"/"date" — tudo calculado uma vez aqui, sobre o
    DataFrame inteiro do período, em vez de recomputado em cada agregação
    (RESOLVIDO 2026-09-16: get_operational_activity chama _build_view uma
    vez por operador, e cada uma chamava .dt.strftime() várias vezes só
    sobre o pedaço desse operador — dezenas de chamadas pequenas de
    strftime, cada uma com o overhead fixo de formatar datas, em vez de
    uma chamada só sobre tudo. Fatiar depois um DataFrame já com a coluna
    de string pronta preserva os mesmos valores, só evita reformatar)."""
    if events.empty:
        events = events.copy()
        events["shift"] = pd.Series(dtype=str)
        events["day_str"] = pd.Series(dtype=str)
        events["month_str"] = pd.Series(dtype=str)
        return events
    events = events.copy()
    minutes = events["date"].dt.hour * 60 + events["date"].dt.minute
    lookup = team_service.team_by_name()
    teams = events["tecnico"].apply(lambda t: team_of(t, lookup))
    events["shift"] = [
        shift_label_for(team, mins) for team, mins in zip(teams, minutes)
    ]
    events["day_str"] = events["date"].dt.strftime("%Y-%m-%d")
    events["month_str"] = events["date"].dt.strftime("%Y-%m")
    return events


def _abertos_events(enriched_principal: pd.DataFrame) -> pd.DataFrame:
    df = enriched_principal[enriched_principal["Técnico"].notna() & (enriched_principal["Técnico"] != "")]
    events = pd.DataFrame({
        "tecnico": df["Técnico"].apply(team_service.normalize_bot_name),
        "date": pd.to_datetime(df["opened_at"], errors="coerce"),
    }).dropna(subset=["date"])
    return _with_shift_column(events)


def _resolvidos_events(raw_ok_matched: pd.DataFrame | None) -> pd.DataFrame:
    if raw_ok_matched is None or raw_ok_matched.empty or "Created by" not in raw_ok_matched.columns:
        return _with_shift_column(pd.DataFrame(columns=["tecnico", "date"]))
    df = raw_ok_matched.copy()
    if "Label" in df.columns:
        df = df[df["Label"] == "OK_GCC"]
    events = pd.DataFrame({
        "tecnico": df["Created by"].apply(team_service.username_to_tecnico),
        "date": pd.to_datetime(df["Created"], errors="coerce"),
    }).dropna(subset=["date"])
    return _with_shift_column(events)


def _ci_events(df_ci_matched: pd.DataFrame | None) -> pd.DataFrame:
    """`df_ci_matched`: já normalizado por ci_service.prepare_ci_rows e
    restrito ao período/região via ci_service.filter_ci_by_incident_set."""
    if df_ci_matched is None or df_ci_matched.empty:
        return _with_shift_column(pd.DataFrame(columns=["tecnico", "date"]))
    events = pd.DataFrame({
        "tecnico": df_ci_matched["tecnico"],
        "date": df_ci_matched["created_at"],
    }).dropna(subset=["date"])
    return _with_shift_column(events)


def _aggregate(events: pd.DataFrame) -> dict:
    if events.empty:
        return {
            "total": 0, "by_hour": [0] * 24, "by_weekday": [0] * 7, "by_month": {},
            "active_days": 0, "avg_per_day": 0.0,
            "peak_day": None, "peak_day_val": 0,
            "peak_hour": 0, "peak_hour_val": 0,
            "peak_weekday": 0,
            "best_month": None, "best_month_val": 0,
        }

    by_hour = events["date"].dt.hour.value_counts().reindex(range(24), fill_value=0)
    by_weekday = events["date"].dt.dayofweek.value_counts().reindex(range(7), fill_value=0)
    by_day = events["day_str"].value_counts()
    by_month = events["month_str"].value_counts()

    total = len(events)
    active_days = int(by_day.shape[0])

    return {
        "total": total,
        "by_hour": by_hour.tolist(),
        "by_weekday": by_weekday.tolist(),
        "by_month": by_month.to_dict(),
        "active_days": active_days,
        "avg_per_day": round(total / active_days, 2) if active_days else 0.0,
        "peak_day": by_day.idxmax(), "peak_day_val": int(by_day.max()),
        "peak_hour": int(by_hour.idxmax()), "peak_hour_val": int(by_hour.max()),
        "peak_weekday": int(by_weekday.idxmax()),
        "best_month": by_month.idxmax(), "best_month_val": int(by_month.max()),
    }


def _shift_stats(events: pd.DataFrame) -> dict:
    result = {}
    for periodo in TURNOS:
        if events.empty:
            result[periodo] = {"count": 0, "avg_per_day": 0.0}
            continue
        sub = events[events["shift"] == periodo]
        dias = sub["day_str"].nunique()
        result[periodo] = {"count": int(len(sub)), "avg_per_day": round(len(sub) / dias, 2) if dias else 0.0}
    return result


def _destaques(agg: dict) -> dict:
    return {
        "peak_day": agg["peak_day"], "peak_day_val": agg["peak_day_val"],
        "peak_hour": agg["peak_hour"], "peak_hour_val": agg["peak_hour_val"],
        "peak_weekday": WEEKDAYS_PT[agg["peak_weekday"]] if agg["total"] else None,
        "best_month": agg["best_month"], "best_month_val": agg["best_month_val"],
    }


def _build_view(abertos: pd.DataFrame, resolvidos: pd.DataFrame, cis: pd.DataFrame) -> dict:
    agg_abertos = _aggregate(abertos)
    agg_resolvidos = _aggregate(resolvidos)
    agg_cis = _aggregate(cis)

    horas = [
        {
            "hour": f"{h:02d}h",
            "abertos": agg_abertos["by_hour"][h],
            "resolvidos": agg_resolvidos["by_hour"][h],
            "cis": agg_cis["by_hour"][h],
        }
        for h in range(24)
    ]
    semana = [
        {
            "weekday": label,
            "abertos": agg_abertos["by_weekday"][i],
            "resolvidos": agg_resolvidos["by_weekday"][i],
            "cis": agg_cis["by_weekday"][i],
        }
        for i, label in enumerate(WEEKDAYS_PT)
    ]
    meses_todos = sorted(set(agg_abertos["by_month"]) | set(agg_resolvidos["by_month"]) | set(agg_cis["by_month"]))
    meses = [
        {
            "month": m,
            "abertos": agg_abertos["by_month"].get(m, 0),
            "resolvidos": agg_resolvidos["by_month"].get(m, 0),
            "cis": agg_cis["by_month"].get(m, 0),
        }
        for m in meses_todos
    ]

    return {
        "kpis": {
            "total_abertos": agg_abertos["total"],
            "total_resolvidos": agg_resolvidos["total"],
            "total_cis": agg_cis["total"],
            "avg_abertos_dia": agg_abertos["avg_per_day"],
            "avg_resolvidos_dia": agg_resolvidos["avg_per_day"],
            "avg_cis_dia": agg_cis["avg_per_day"],
            "dias_ativos_abertos": agg_abertos["active_days"],
            "dias_ativos_resolvidos": agg_resolvidos["active_days"],
            "dias_ativos_cis": agg_cis["active_days"],
        },
        "destaques": {
            "abertos": _destaques(agg_abertos),
            "resolvidos": _destaques(agg_resolvidos),
            "cis": _destaques(agg_cis),
        },
        "turnos": {
            "abertos": _shift_stats(abertos),
            "resolvidos": _shift_stats(resolvidos),
            "cis": _shift_stats(cis),
        },
        "distribuicao_horaria": horas,
        "distribuicao_semana": semana,
        "evolucao_mensal": meses,
    }


def _team_breakdown(abertos: pd.DataFrame, resolvidos: pd.DataFrame, cis: pd.DataFrame) -> dict:
    lookup = team_service.team_by_name()

    def per_team(events: pd.DataFrame) -> dict:
        if events.empty:
            return {"PT": 0, "BR": 0, "-": 0}
        counts = events["tecnico"].apply(lambda t: team_of(t, lookup)).value_counts()
        return {t: int(counts.get(t, 0)) for t in ("PT", "BR", "-")}

    return {"abertos": per_team(abertos), "resolvidos": per_team(resolvidos), "cis": per_team(cis)}


def get_operational_activity(
    enriched_principal: pd.DataFrame,
    raw_ok_matched: pd.DataFrame | None,
    df_ci_matched: pd.DataFrame | None = None,
    hidden: set[str] | None = None,
) -> dict:
    """
    `enriched_principal`: gcc_abertos já filtrado (período/região/técnicos
    ocultos/cancelados) e enriquecido (ver transform.enrich_sys_report_
    template). `raw_ok_matched`/`df_ci_matched`: tabelas "ok_"/"cis" já
    restritas aos incidentes desse mesmo filtro (ver
    team_service.filter_ok_by_incident_set / ci_service.filter_ci_by_incident_set
    — chamados uma vez só pelo history_service e reaproveitados aqui e em
    team_service.get_team_activity, pra não filtrar duas vezes).
    `hidden`: nomes de operador (formato "Técnico") a excluir de TODA a
    análise (globais + individual) — filtro de operadores da Atividade
    Operacional, réplica do checklist HIDDEN do protótipo v20.

    Devolve {"global": {...}, "individual": [{"tecnico", "team",
    "username", ...}]} — "global" agrega todos os operadores,
    "individual" tem os mesmos campos por operador (união de quem abriu/
    resolveu/colocou CI's no período), ordenado por total de abertos.
    "username" (Nº EX, ver team_service.username_by_tecnico) é None se o
    nome não bater em ninguém do roster.
    """
    abertos_all = _abertos_events(enriched_principal)
    resolvidos_all = _resolvidos_events(raw_ok_matched)
    cis_all = _ci_events(df_ci_matched)

    if hidden:
        abertos_all = abertos_all[~abertos_all["tecnico"].isin(hidden)]
        resolvidos_all = resolvidos_all[~resolvidos_all["tecnico"].isin(hidden)]
        cis_all = cis_all[~cis_all["tecnico"].isin(hidden)]

    global_view = _build_view(abertos_all, resolvidos_all, cis_all)
    global_view["equipas"] = _team_breakdown(abertos_all, resolvidos_all, cis_all)

    operadores = sorted(
        (set(abertos_all["tecnico"]) | set(resolvidos_all["tecnico"]) | set(cis_all["tecnico"])) - {""}
    )
    team_lookup = team_service.team_by_name()
    individual = []
    for tecnico in operadores:
        view = _build_view(
            abertos_all[abertos_all["tecnico"] == tecnico],
            resolvidos_all[resolvidos_all["tecnico"] == tecnico],
            cis_all[cis_all["tecnico"] == tecnico],
        )
        view["tecnico"] = tecnico
        view["team"] = team_of(tecnico, team_lookup)
        view["username"] = team_service.username_by_tecnico(tecnico)
        individual.append(view)
    individual.sort(key=lambda r: r["kpis"]["total_abertos"], reverse=True)

    return {"global": global_view, "individual": individual}
