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

# Cores de marca por tecnologia (2026-08, paleta oficial passada pelo
# negócio) — usadas em qualquer gráfico "por ferramenta" (Status de
# Ferramentas, Falha de SLA por Ferramenta, etc).
#
# ASSUNÇÃO: "SOLMAN" aqui não distingue BR/PT (a coluna "Keyword Found",
# que é o que estes gráficos agrupam, não tem o sufixo de região — só a
# coluna "Source" tem "SOLMAN BR"/"SOLMAN PT" separados, e não é usada
# em nenhum gráfico atualmente). Usei a cor de "SOLMAN BR" da tabela.
# Se quiseres os dois separados de verdade, os gráficos precisam de
# passar a agrupar por "Source" em vez de "Keyword Found" — mudança
# maior que só cor, avisa se for isso que queres.
TOOL_COLORS = {
    "AWS": "#3F46F7",
    "AZURE": "#00F2DE",
    "COLLECT": "#091823",
    "CONTROL-M": "#A4DDEE",
    "CRM-ML": "#3599B8",
    "CYBERARK": "#4AC5BB",
    "DYNATRACE": "#FB4540",
    "EAI-SAP": "#260C14",
    "ELASTIC": "#38516D",
    "ITSI": "#FF9933",
    "NTP": "#050C12",
    "OEM": "#F80000",
    "OEM_BKP": "#DFBFBF",
    "SCOM": "#0072C6",
    "SOLARWINDS": "#FCC200",
    "SOLMAN": "#FE8743",
    "SYSGRID": "#F2BE6E",
    # fallback para keywords que aparecem mas não têm cor definida
    "_default": "#94a3b8",
}

# Cores "AI/secundária" da mesma paleta — usadas na página AIOPER (ver
# dashboard_service.get_aioper_summary), já que essa página é
# especificamente sobre incidentes abertos por automação. Ferramentas
# sem cor secundária definida na tabela original caem no fallback.
TOOL_COLORS_AI = {
    "AWS": "#3F3E3D",
    "AZURE": "#35A0FE",
    "CONTROL-M": "#25A948",
    "CRM-ML": "#FFC108",
    "ELASTIC": "#9044B0",
    "ITSI": "#E57C20",
    "OEM": "#1BBC9D",
    "OEM_BKP": "#FF0500",
    "SCOM": "#E6E6E6",
    "SOLMAN": "#F39B13",
    "SYSGRID": "#EEB6B7",
    "_default": "#94a3b8",
}
