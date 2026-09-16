# services/operators_service.py
import pandas as pd

from . import dashboard_service, team_service


def get_operators_summary(df: pd.DataFrame) -> list:
    df = df[df["Técnico"].notna() & (df["Técnico"] != "")].copy()
    df["Técnico"] = df["Técnico"].apply(team_service.normalize_bot_name)
    rows = []
    for tecnico, grupo in df.groupby("Técnico"):
        inc = len(grupo)
        com_evento = grupo[grupo["Coluna"] > -1]
        sla_pct = 0
        nok = 0
        if len(com_evento) > 0:
            ok = (com_evento["Coluna"] == 0).sum()
            nok = int((com_evento["Coluna"] == 1).sum())
            sla_pct = round(ok / len(com_evento) * 100)
        nok_pct = round(nok / inc * 100) if inc > 0 else 0

        avg_seconds = grupo["SLA 3.0"].dropna()
        avg_seconds = avg_seconds[avg_seconds >= 0].mean()
        if avg_seconds and avg_seconds == avg_seconds:
            h, rem = divmod(int(avg_seconds), 3600)
            m, s = divmod(rem, 60)
            tempo = f"{h:02d}:{m:02d}:{s:02d}"
        else:
            tempo = "00:00:00"

        rows.append({
            "name": tecnico, "inc": inc, "pts": 0, "sla": sla_pct, "time": tempo,
            "nok": nok, "nok_pct": nok_pct,
        })

    rows.sort(key=lambda r: r["inc"], reverse=True)
    return rows


def get_operator_detail(df: pd.DataFrame, tecnico: str) -> dict | None:
    """
    Reaproveita os mesmos cálculos do dashboard (get_kpis/priority/tools),
    só que rodando sobre o subconjunto de incidentes de UM técnico — pra
    alimentar o clique "ver dados desse operador" no frontend.
    """
    subset = df[df["Técnico"].apply(team_service.normalize_bot_name) == tecnico]
    if subset.empty:
        return None

    return {
        "name": tecnico,
        "kpis": dashboard_service.get_kpis(subset),
        "priority_breakdown": dashboard_service.get_priority_breakdown(subset),
        "tools_breakdown": dashboard_service.get_tools_breakdown(subset),
    }
