# services/operators_service.py
import pandas as pd


def get_operators_summary(df: pd.DataFrame) -> list:
    df = df[df["Técnico"].notna() & (df["Técnico"] != "")]
    rows = []
    for tecnico, grupo in df.groupby("Técnico"):
        inc = len(grupo)
        com_evento = grupo[grupo["Coluna"] > -1]
        sla_pct = 0
        if len(com_evento) > 0:
            ok = (com_evento["Coluna"] == 0).sum()
            sla_pct = round(ok / len(com_evento) * 100)

        avg_seconds = grupo["SLA 3.0"].dropna()
        avg_seconds = avg_seconds[avg_seconds >= 0].mean()
        if avg_seconds and avg_seconds == avg_seconds:
            h, rem = divmod(int(avg_seconds), 3600)
            m, s = divmod(rem, 60)
            tempo = f"{h:02d}:{m:02d}:{s:02d}"
        else:
            tempo = "00:00:00"

        rows.append({"name": tecnico, "inc": inc, "pts": 0, "sla": sla_pct, "time": tempo})

    rows.sort(key=lambda r: r["inc"], reverse=True)
    return rows
