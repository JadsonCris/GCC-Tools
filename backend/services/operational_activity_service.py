# services/operational_activity_service.py
"""
Análise de atividade operacional (abertos vs resolvidos) por hora do dia,
dia da semana, mês e turno — adaptado do protótipo HTML "análise de
incidentes" (upload manual de CSV/XLSX) fornecido pelo utilizador, mas
consumindo os dados reais já carregados na BD (gcc_abertos + ok_) em vez
de ficheiros carregados à mão. Alimenta a secção "Atividade Operacional"
de Central Operacional (substituiu a antiga tabela "Atividade da
Equipa").

Definições confirmadas com o utilizador:
- "incidentes abertos" = todos os incidentes cujo "Técnico" (coluna
  "Opened by" já enriquecida) é o operador — mesmo conceito já usado em
  team_service.get_team_activity.
- "incidentes resolvidos" = todas as tags "OK_GCC" feitas pelo operador
  (tabela "ok_", coluna "Created by") — a tag manual de conclusão que a
  equipa já usa, NÃO o estado "Closed" do incidente.

PT/BR: agrupamento só para estes gráficos, baseado em onde a PESSOA está
sediada (geografia da equipa) — nada a ver com "Column Measure"
(Ibéria/Brasil, geografia do CLIENTE afetado, usada no resto da app).
Lista replicada tal como veio no protótipo HTML; quem não consta em
nenhuma das duas cai em "Sem equipa" (ex: liderança).
"""
import pandas as pd

from services import team_service

TEAM_PT = {
    "Rodolfo Coelho", "Tiago Gouveia", "Jadson Silva", "José Pereira",
    "Miguel Santos", "Diogo Mendes", "Duarte Jorge", "Fernando Januário",
}
TEAM_BR = {
    "André Negry", "Bruno Caramelo", "Diego Santos", "Edio Vital",
    "Guilherme Silva", "Emanuel Vital",
}

WEEKDAYS_PT = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]
TURNOS = ("Manhã", "Tarde", "Noite")


def _team_of(tecnico: str) -> str:
    base = str(tecnico or "").replace(" Claranet", "").strip()
    if base in TEAM_PT:
        return "PT"
    if base in TEAM_BR:
        return "BR"
    return "-"


def _period_of(hour: int) -> str:
    """Manhã 09-17 / Tarde 17-01 / Noite 01-09 — mesmos limites do protótipo HTML."""
    if 9 <= hour < 17:
        return "Manhã"
    if hour >= 17 or hour < 1:
        return "Tarde"
    return "Noite"


def _abertos_events(enriched_principal: pd.DataFrame) -> pd.DataFrame:
    df = enriched_principal[enriched_principal["Técnico"].notna() & (enriched_principal["Técnico"] != "")]
    return pd.DataFrame({
        "tecnico": df["Técnico"],
        "date": pd.to_datetime(df["opened_at"], errors="coerce"),
    }).dropna(subset=["date"])


def _resolvidos_events(raw_ok_matched: pd.DataFrame | None) -> pd.DataFrame:
    if raw_ok_matched is None or raw_ok_matched.empty or "Created by" not in raw_ok_matched.columns:
        return pd.DataFrame(columns=["tecnico", "date"])
    df = raw_ok_matched.copy()
    if "Label" in df.columns:
        df = df[df["Label"] == "OK_GCC"]
    return pd.DataFrame({
        "tecnico": df["Created by"].apply(team_service.username_to_tecnico),
        "date": pd.to_datetime(df["Created"], errors="coerce"),
    }).dropna(subset=["date"])


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
    by_day = events["date"].dt.strftime("%Y-%m-%d").value_counts()
    by_month = events["date"].dt.strftime("%Y-%m").value_counts()

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
        sub = events[events["date"].dt.hour.apply(_period_of) == periodo]
        dias = sub["date"].dt.strftime("%Y-%m-%d").nunique()
        result[periodo] = {"count": int(len(sub)), "avg_per_day": round(len(sub) / dias, 2) if dias else 0.0}
    return result


def _destaques(agg: dict) -> dict:
    return {
        "peak_day": agg["peak_day"], "peak_day_val": agg["peak_day_val"],
        "peak_hour": agg["peak_hour"], "peak_hour_val": agg["peak_hour_val"],
        "peak_weekday": WEEKDAYS_PT[agg["peak_weekday"]] if agg["total"] else None,
        "best_month": agg["best_month"], "best_month_val": agg["best_month_val"],
    }


def _build_view(abertos: pd.DataFrame, resolvidos: pd.DataFrame) -> dict:
    agg_abertos = _aggregate(abertos)
    agg_resolvidos = _aggregate(resolvidos)

    horas = [
        {"hour": f"{h:02d}h", "abertos": agg_abertos["by_hour"][h], "resolvidos": agg_resolvidos["by_hour"][h]}
        for h in range(24)
    ]
    semana = [
        {"weekday": label, "abertos": agg_abertos["by_weekday"][i], "resolvidos": agg_resolvidos["by_weekday"][i]}
        for i, label in enumerate(WEEKDAYS_PT)
    ]
    meses_todos = sorted(set(agg_abertos["by_month"]) | set(agg_resolvidos["by_month"]))
    meses = [
        {"month": m, "abertos": agg_abertos["by_month"].get(m, 0), "resolvidos": agg_resolvidos["by_month"].get(m, 0)}
        for m in meses_todos
    ]

    return {
        "kpis": {
            "total_abertos": agg_abertos["total"],
            "total_resolvidos": agg_resolvidos["total"],
            "avg_abertos_dia": agg_abertos["avg_per_day"],
            "avg_resolvidos_dia": agg_resolvidos["avg_per_day"],
            "dias_ativos_abertos": agg_abertos["active_days"],
            "dias_ativos_resolvidos": agg_resolvidos["active_days"],
        },
        "destaques": {"abertos": _destaques(agg_abertos), "resolvidos": _destaques(agg_resolvidos)},
        "turnos": {"abertos": _shift_stats(abertos), "resolvidos": _shift_stats(resolvidos)},
        "distribuicao_horaria": horas,
        "distribuicao_semana": semana,
        "evolucao_mensal": meses,
    }


def _team_breakdown(abertos: pd.DataFrame, resolvidos: pd.DataFrame) -> dict:
    def per_team(events: pd.DataFrame) -> dict:
        if events.empty:
            return {"PT": 0, "BR": 0, "-": 0}
        counts = events["tecnico"].apply(_team_of).value_counts()
        return {t: int(counts.get(t, 0)) for t in ("PT", "BR", "-")}

    return {"abertos": per_team(abertos), "resolvidos": per_team(resolvidos)}


def get_operational_activity(enriched_principal: pd.DataFrame, raw_ok_matched: pd.DataFrame | None) -> dict:
    """
    `enriched_principal`: gcc_abertos já filtrado (período/região/técnicos
    ocultos/cancelados) e enriquecido (ver transform.enrich_sys_report_
    template). `raw_ok_matched`: tabela "ok_" já restrita aos incidentes
    desse mesmo filtro (ver team_service.filter_ok_by_incident_set —
    chamado uma vez só pelo history_service e reaproveitado aqui e em
    team_service.get_team_activity, pra não filtrar duas vezes).

    Devolve {"global": {...}, "individual": [{"tecnico", "team", ...}]}
    — "global" agrega todos os operadores, "individual" tem os mesmos
    campos por operador (união de quem abriu e/ou resolveu no período),
    ordenado por total de abertos.
    """
    abertos_all = _abertos_events(enriched_principal)
    resolvidos_all = _resolvidos_events(raw_ok_matched)

    global_view = _build_view(abertos_all, resolvidos_all)
    global_view["equipas"] = _team_breakdown(abertos_all, resolvidos_all)

    operadores = sorted((set(abertos_all["tecnico"]) | set(resolvidos_all["tecnico"])) - {""})
    individual = []
    for tecnico in operadores:
        view = _build_view(
            abertos_all[abertos_all["tecnico"] == tecnico],
            resolvidos_all[resolvidos_all["tecnico"] == tecnico],
        )
        view["tecnico"] = tecnico
        view["team"] = _team_of(tecnico)
        individual.append(view)
    individual.sort(key=lambda r: r["kpis"]["total_abertos"], reverse=True)

    return {"global": global_view, "individual": individual}
