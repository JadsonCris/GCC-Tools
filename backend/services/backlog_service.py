# services/backlog_service.py
"""
Backlog (MON Backlog INCs / MON Backlog RITM) — contagem total. Não achei
medida DAX específica de "status crítico" no que já foi analisado, então
o campo `status` abaixo é um limiar arbitrário (>150), só decorativo pra
UI — não é uma métrica confirmada do modelo original.
"""
import pandas as pd


def get_backlog_summary(df_inc: pd.DataFrame | None, df_ritm: pd.DataFrame | None) -> dict:
    inc_count = len(df_inc) if df_inc is not None else 0
    ritm_count = len(df_ritm) if df_ritm is not None else 0

    return {
        "backlog_total": inc_count + ritm_count,
        "backlog_incidentes": inc_count,
        "backlog_ritm": ritm_count,
        # limiar arbitrário, só pra UI — não é medida DAX confirmada
        "status": "crítico" if (inc_count + ritm_count) > 150 else "estável",
    }
