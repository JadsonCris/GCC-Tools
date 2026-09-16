# services/timeline_service.py
"""
Deteção de sessões de trabalho por operador — porta de
tlBuildSessions/tlMakeSession do protótipo "análise de incidentes" v20:
agrupa eventos (Abertos + Resolvidos + CI's) por operador, ordenados no
tempo; um gap > 1h fecha o período de atividade atual e inicia outro.

Alimenta a Timeline e o Equilíbrio de Turnos de Central Operacional — as
duas consomem a mesma lista de sessões (ver routers/dashboard.py, GET
/dashboard/timeline), evitando calcular a deteção de sessões duas vezes
e mantendo os controlos do Equilíbrio (min. sobreposição, min. diferença,
etc.) instantâneos no frontend em vez de um pedido novo por mudança.
"""
import pandas as pd

from services import team_service
from services.operational_activity_service import shift_label_for, team_of

SESSION_GAP = pd.Timedelta(hours=1)


def _events(
    enriched_principal: pd.DataFrame, raw_ok_matched: pd.DataFrame | None, cis_matched: pd.DataFrame | None
) -> pd.DataFrame:
    """Uma linha por evento (abertura/resolução/CI), com tecnico/date/tipo."""
    frames = []

    df = enriched_principal[enriched_principal["Técnico"].notna() & (enriched_principal["Técnico"] != "")]
    if not df.empty:
        frames.append(pd.DataFrame({
            "tecnico": df["Técnico"].apply(team_service.normalize_bot_name),
            "date": pd.to_datetime(df["opened_at"], errors="coerce"),
            "tipo": "inc",
        }))

    if raw_ok_matched is not None and not raw_ok_matched.empty and "Created by" in raw_ok_matched.columns:
        ok_df = raw_ok_matched.copy()
        if "Label" in ok_df.columns:
            ok_df = ok_df[ok_df["Label"] == "OK_GCC"]
        frames.append(pd.DataFrame({
            "tecnico": ok_df["Created by"].apply(team_service.username_to_tecnico),
            "date": pd.to_datetime(ok_df["Created"], errors="coerce"),
            "tipo": "res",
        }))

    if cis_matched is not None and not cis_matched.empty:
        frames.append(pd.DataFrame({
            "tecnico": cis_matched["tecnico"],
            "date": cis_matched["created_at"],
            "tipo": "ci",
        }))

    if not frames:
        return pd.DataFrame(columns=["tecnico", "date", "tipo"])
    events = pd.concat(frames, ignore_index=True)
    return events.dropna(subset=["date", "tecnico"])


def _sessionize(dates: list[pd.Timestamp], tipos: list[str]) -> list[dict]:
    """Agrupa os eventos JÁ ORDENADOS de UM operador em sessões (gap > 1h
    fecha o período atual e inicia outro — mesma regra do protótipo)."""
    sessions = []
    current = None
    for date, tipo in zip(dates, tipos):
        if current is None or date - current["end"] > SESSION_GAP:
            if current is not None:
                sessions.append(current)
            current = {"start": date, "end": date, "inc": 0, "res": 0, "ci": 0}
        else:
            current["end"] = date
        current[tipo] += 1
    if current is not None:
        sessions.append(current)
    return sessions


def get_sessions(
    enriched_principal: pd.DataFrame,
    raw_ok_matched: pd.DataFrame | None,
    cis_matched: pd.DataFrame | None,
    hidden: set[str] | None = None,
) -> list[dict]:
    """
    Devolve uma sessão por período de trabalho detetado, por operador:
    `[{tecnico, team, shift, start, end, duration_min, inc, res, ci, total}, ...]`
    (start/end em ISO 8601, ordenadas por início). `enriched_principal`/
    `raw_ok_matched`/`cis_matched` já devem vir filtrados por mês+região
    (ver history_service.get_operational_timeline) — esta função só
    agrupa, não filtra por período. `hidden`: nomes de operador a excluir
    (mesmo filtro de operadores da Atividade Operacional).
    """
    events = _events(enriched_principal, raw_ok_matched, cis_matched)
    if hidden:
        events = events[~events["tecnico"].isin(hidden)]
    if events.empty:
        return []

    team_lookup = team_service.team_by_name()
    out = []
    for tecnico, group in events.sort_values("date").groupby("tecnico"):
        team = team_of(tecnico, team_lookup)
        for s in _sessionize(group["date"].tolist(), group["tipo"].tolist()):
            minutes = s["start"].hour * 60 + s["start"].minute
            out.append({
                "tecnico": tecnico,
                "team": team,
                "shift": shift_label_for(team, minutes),
                "start": s["start"].isoformat(),
                "end": s["end"].isoformat(),
                "duration_min": int(round((s["end"] - s["start"]).total_seconds() / 60)),
                "inc": s["inc"],
                "res": s["res"],
                "ci": s["ci"],
                "total": s["inc"] + s["res"] + s["ci"],
            })
    out.sort(key=lambda r: r["start"])
    return out
