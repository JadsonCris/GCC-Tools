# services/incidents_service.py
import pandas as pd
from .dashboard_service import PRIORITY_LABELS, PRIORITY_COLORS


def get_incidents_summary(df: pd.DataFrame) -> dict:
    bars = []
    for raw_priority, label in PRIORITY_LABELS.items():
        val = int(df["priority"].astype(str).str.startswith(raw_priority).sum())
        legend = f"({val} vazio) {label}" if val == 0 else f"{val} {label}"
        bars.append({"label": label, "val": val, "color": PRIORITY_COLORS[label], "legend": legend})
    return {"bars": bars, "total": sum(b["val"] for b in bars)}
