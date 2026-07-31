# services/dashboard_service.py
"""
Recebe o DataFrame de sys_report_template já enriquecido (via
transform.enrich_sys_report_template) e calcula KPIs/gráficos. Quem
baixa e enriquece é o cache.py, uma vez por ciclo.
"""
import pandas as pd

from .keywords import TOOL_COLORS

PRIORITY_LABELS = {"1": "Critical", "2": "High", "3": "Moderate", "4": "Low"}
PRIORITY_COLORS = {
    "Critical": "#ff4f6b", "High": "#ffb84f", "Moderate": "#4f7fff", "Low": "#00e5a0",
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


def get_tools_breakdown(df: pd.DataFrame) -> list:
    counts = df["Keyword Found"].dropna().value_counts()
    result = [
        {"name": tool, "val": int(val), "color": TOOL_COLORS.get(tool, TOOL_COLORS["_default"])}
        for tool, val in counts.items()
    ]
    result.sort(key=lambda x: x["val"], reverse=True)
    return result
