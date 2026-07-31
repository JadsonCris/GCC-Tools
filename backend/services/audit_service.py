# services/audit_service.py
"""
Métrica de Despromovidos (P1 despromovidos).

GROUNDED — a medida DAX original é literalmente:
    Despromovidos[Incidentes Abertos Como P1 Que Foram Despromovidos] =
        COUNTROWS(Despromovidos)

A tabela Despromovidos já vem PRÉ-FILTRADA do ServiceNow (Power Query):
só ficam linhas cujo sys_id aparece em AuditKeys[documentkey] E cuja
priority NÃO é "1 - Critical" — isso já significa "foi P1 e foi
rebaixado". Por isso a medida em cima é só a contagem de linhas, sem
filtro adicional (a versão anterior deste arquivo refiltrava por
priority de novo, o que é redundante e arriscava contar errado se o
formato do campo priority no CSV variasse).
"""
import pandas as pd


def get_despromovidos_metrics(df_desp: pd.DataFrame) -> dict:
    return {
        "p1_despromovidos_count": len(df_desp),
        "p1_despromovidos": len(df_desp),  # alias
    }
