# services/keywords.py
"""
Tabela de keywords extraída literalmente do modelo DAX do .pbix
(tabela calculada `Keywords`). É esta lista que alimenta o gráfico
"Falhas por Ferramenta" (ToolChart / Tools.jsx).
"""

# (keyword, context_priority) — mesma ordem/valores do DATATABLE original
KEYWORDS = [
    ("AWS", 3),
    ("AZURE", 4),
    ("COLLECT", 2),
    ("CONTROL-M", 4),
    ("CRM-ML", 4),
    ("CYBERARK", 3),
    ("DYNATRACE", 4),
    ("EAI-SAP", 4),
    ("ELASTIC", 2),
    ("ITSI", 1),
    ("ITSI_MON", 2),
    ("ITM", 2),
    ("NTP", 4),
    ("OEM", 1),
    ("OEM_BKP", 1),
    ("SCOM", 2),
    ("SOLARWINDS", 4),
    ("SOLMAN", 3),
    ("SAP", 3),
    ("SYSGRID", 3),
]

KEYWORD_LIST = sorted(k for k, _ in KEYWORDS)  # ordem alfabética, usada no MIN() do DAX

# Cores usadas no Tools.jsx do front — mantém consistência visual
TOOL_COLORS = {
    "DYNATRACE": "#ff4f6b",
    "SOLMAN": "#4f7fff",
    "ELASTIC": "#00e5a0",
    "CONTROL-M": "#ffb84f",
    "COLLECT": "#a855f7",
    "SCOM": "#06b6d4",
    "OEM": "#f97316",
    "ITSI": "#ec4899",
    "AWS": "#84cc16",
    # fallback para keywords que aparecem mas não têm cor definida no front
    "_default": "#94a3b8",
}
