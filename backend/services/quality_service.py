# services/quality_service.py
"""
Métricas de Qualidade: OK/NOK (GROUNDED) + IA vs Manual (APROXIMAÇÃO).

OK/NOK usam a coluna `Coluna` (0=OK, 1=NOK) que já é a réplica fiel da
lógica DAX original — mesma fonte que alimenta o SLA% do dashboard.

ai_incidentes/manual_incidentes NÃO SÃO GROUNDED — não achei a medida
DAX real (AIINCs/MANUALINCS/AIOperator) em nenhum .tmdl que analisei até
agora. O valor abaixo é uma HEURÍSTICA (incidentes cujo Keyword Found é
uma ferramenta de monitorização automática — SCOM/ITM) que PODE não
bater com a definição real do Power BI. Se você tiver o .tmdl com essas
3 medidas, me manda que eu porto certinho em vez de aproximar.
"""
import pandas as pd

# Ferramentas de monitorização automática — usado só como heurística de
# "provavelmente aberto por automação", NÃO é a definição confirmada.
_AUTOMATED_TOOL_HINTS = ("SCOM", "ITM", "ITSI")


def get_quality_metrics(df: pd.DataFrame) -> dict:
    total = len(df)

    com_evento = df[df["Coluna"] > -1]
    count_ok = int((com_evento["Coluna"] == 0).sum()) if len(com_evento) > 0 else 0
    count_nok = int((com_evento["Coluna"] == 1).sum()) if len(com_evento) > 0 else 0

    # HEURÍSTICA — ver aviso no topo do arquivo.
    keyword_col = df.get("Keyword Found", pd.Series(dtype=str))
    ai_incs = int(
        keyword_col.astype(str).str.upper().isin(_AUTOMATED_TOOL_HINTS).sum()
    )
    manual_incs = total - ai_incs

    justificados = int(df["Justificado?"].eq("sim").sum()) if "Justificado?" in df.columns else 0
    keyword_count = int(keyword_col.notna().sum())

    return {
        "ok_count": count_ok,
        "nok_count": count_nok,
        "keyword_count": keyword_count,
        "justificados": justificados,
        # ⚠️ aproximação, não medida DAX confirmada — ver docstring
        "ai_incidentes": ai_incs,
        "manual_incidentes": manual_incs,
        "taxa_automacao": round((ai_incs / total * 100), 1) if total > 0 else 0.0,
        "is_ai_split_approximate": True,
    }
