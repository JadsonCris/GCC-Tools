# services/transform.py
"""
Replica em pandas as colunas calculadas (DAX) e transformações (Power Query)
que o Power BI aplicava sobre a tabela `sys_report_template` (PRINCIPAL_URL).

Cada função abaixo corresponde a UMA coluna calculada do modelo original.
Os nomes das colunas de saída foram mantidos em português/PT-BR, iguais
aos do .pbix, para facilitar o rastreio caso precises comparar com o
relatório original.
"""
import logging
import re

import numpy as np
import pandas as pd

from .keywords import KEYWORD_LIST
from .justificacoes_service import parse_justificacoes, get_justified_map

logger = logging.getLogger("transform")

# Técnicos considerados "BR" e "PT" para efeitos de Turno / Geografia da Equipa
# (extraído literalmente das SWITCH() do DAX — ajusta aqui se a equipa mudar)
TECNICOS_BR = {
    "Henrique Souza Claranet", "André Negry Claranet", "Bruno Caramelo Claranet",
    "Matheus Souza Claranet", "Oriano Junior Claranet", "Samuel Souza Claranet",
    "Edio Vital Claranet", "Guilherme Silva Claranet",
}
TECNICOS_PT = {
    "Bruno Santos Claranet", "Miguel Santos Claranet", "Miguel Sequeira Claranet",
    "Francisco Salgado Claranet", "Daniel Baptista Claranet", "Bruno Silva Claranet",
    "Bruno Gomes Claranet", "Ricardo Silva Claranet",
}

# Lista fixa (além da convenção de sufixo "OM" — ver add_grupo_column)
# pra gente da Monitorização cujo nome no ServiceNow não segue esse
# padrão. Removi "Nuno Miguel Melo Machado Azevedo Martins Claranet"
# (nome antigo/errado, não batia com a convenção real confirmada: o
# Nuno é identificado pelo sufixo "OM" no nome, tipo "Nuno Martins OM").
MONITORIZACAO_NOMES = {
    "DENIS TEXEIRA CLARANET",
}

# Contas de automação/IA — classificadas num grupo à parte (AIOPER), nem
# Operação nem Monitorização.
#
# Sinal PRIMÁRIO (migração 2026-08, CONFIRMADO com export real): campo
# "contact_type" foi adicionado ao PRINCIPAL_URL especificamente pra
# isto, e sai como cabeçalho "Channel" no export. Validado num .xls real
# de 5606 linhas: as 908 linhas abertas por "AIOPS Integração Snowp14"
# têm Channel="Automatic" — e NENHUMA outra linha tem esse valor (as
# demais são "Backend" ou "Self-service"). Sinal 100% grounded agora.
AIOPER_CHANNEL_VALUE = "AUTOMATIC"

# Sinal de FALLBACK (usado só se a coluna "channel" não vier no export,
# ex: dado antigo em backlog de antes desta coluna existir): nome começa
# por "AIOPS" (convenção observada nos dados reais: "AIOPS Integração
# Snowp14"), em vez de lista fixa, pra cobrir variações futuras (Snowp15
# etc.) sem precisar atualizar isto sempre que surgir uma nova instância
# do bot.
AIOPER_PREFIX = "AIOPS"

# Técnicos que não devem aparecer em NENHUMA métrica (contas de
# gestão/pessoais que abrem incidentes mas não fazem parte da operação
# medida). Comparação case-insensitive e sem espaços nas pontas.
HIDDEN_TECNICOS = {
    "LUÍS MIGUEL MARTINS",
}


def exclude_hidden_technicians(df: pd.DataFrame, column: str = "Opened by") -> pd.DataFrame:
    """
    Remove linhas dos técnicos de HIDDEN_TECNICOS. Precisa ser chamada
    ANTES de qualquer cálculo/enrich, tanto na tabela principal (GCC
    Abertos) quanto na SLA3 (P1s) — senão a pessoa some das métricas
    "por operador" mas continua contando nos totais agregados.
    """
    if column not in df.columns:
        return df
    normalized = df[column].astype(str).str.strip().str.upper()
    return df[~normalized.isin(HIDDEN_TECNICOS)].copy()


def exclude_canceled_incidents(df: pd.DataFrame, column: str = "State") -> pd.DataFrame:
    """
    Remove incidentes com estado "Canceled" — pedido do negócio: não
    fazem sentido em NENHUMA métrica (volume, SLA, qualidade...), já que
    nunca chegaram a ser tratados de verdade. Chamada ANTES do rename
    (por isso o nome de coluna default é "State", não "incident_state"),
    no mesmo ponto que exclude_hidden_technicians.
    """
    if column not in df.columns:
        return df
    normalized = df[column].astype(str).str.strip().str.upper()
    return df[normalized != "CANCELED"].copy()


def _rename_raw_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Espelha a etapa de Power Query, adaptado para os cabeçalhos REAIS da
    exportação EXCEL da instância nova (edpon.service-now.com, migração
    2026-08) — confirmados abrindo os .xls baixados manualmente em
    backend/downloads/ (a exportação usa rótulos "amigáveis" da lista do
    ServiceNow, não os nomes brutos de campo pedidos em sysparm_fields):

      Number               -> Incidente
      Opened by            -> Técnico
      Created              -> opened_at
      State                -> incident_state   (valores confirmados:
                               "New", "In Progress", "On Hold", "Closed",
                               "Canceled" — batem com OPEN_STATES)
      Priority              -> priority          (confirmado: vem como
                               "1 - Critical", "2 - High" etc., não como
                               dígito solto — o código já lida com isso
                               via str.startswith/contains)
      Parent                -> company           (confirmado: valores tipo
                               "Parent-EDP PT", "Parent-EDP BRASIL",
                               "Parent-EDP ES" — ver add_region_column)
      Short description     -> short_description
      Category              -> category
      Subcategory           -> subcategory
      Correlation ID        -> correlation_id
      Correlation display   -> correlation_display
      Updated               -> sys_updated_on
      Caller                -> caller_id
      Parent Incident       -> parent_incident
      Service               -> business_service
      Service offering      -> service_offering
      Assignment group      -> assignment_group
      Assigned to           -> assigned_to
      Major incident state  -> major_incident_state
      Channel               -> channel            (CONFIRMADO — ver
                               AIOPER_CHANNEL_VALUE acima)
      Event first occurrence -> u_first_occurrence (CONFIRMADO 2026-08:
                               o campo pedido no sysparm_fields mudou de
                               nome pra "u_event_first_occurrence" e AGORA
                               vem no export, com este cabeçalho — ver
                               add_sla_columns)

    Campo que a exportação ainda NÃO traz mesmo pedindo em sysparm_fields:
    "tags".
    """
    df = df.rename(columns={
        "Number": "Incidente",
        "Opened by": "Técnico",
        "Created": "opened_at",
        "State": "incident_state",
        "Priority": "priority",
        "Parent": "company",
        "Short description": "short_description",
        "Category": "category",
        "Subcategory": "subcategory",
        "Correlation ID": "correlation_id",
        "Correlation display": "correlation_display",
        "Updated": "sys_updated_on",
        "Caller": "caller_id",
        "Parent Incident": "parent_incident",
        "Service": "business_service",
        "Service offering": "service_offering",
        "Assignment group": "assignment_group",
        "Assigned to": "assigned_to",
        "Major incident state": "major_incident_state",
        "Channel": "channel",
        "Event first occurrence": "u_first_occurrence",
    })
    return df


def add_sla_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    SLA 3.0 = diferença em segundos entre o primeiro evento de
    monitorização e opened_at. Coluna = -1 (sem evento) / 1 (NOK,
    >=900s) / 0 (OK, <900s).

    RESOLVIDO (migração 2026-08): o campo vinha faltando porque o
    sysparm_fields pedia "u_first_occurrence" (nome errado); corrigido
    pra "u_event_first_occurrence", que agora sai no export como
    "Event first occurrence" (ver _rename_raw_columns). Confirmado num
    .xls real que os valores fazem sentido (poucos minutos antes de
    "Created"). O `if`/`else` abaixo fica como rede de segurança: se por
    algum motivo a coluna desaparecer de novo (ex: alguém mexe na URL),
    cai em "sem evento" (-1) em vez de quebrar.
    """
    df["opened_at"] = pd.to_datetime(df["opened_at"], errors="coerce")

    if "u_first_occurrence" in df.columns:
        df["u_first_occurrence"] = pd.to_datetime(df["u_first_occurrence"], errors="coerce")
        delta = (df["opened_at"] - df["u_first_occurrence"]).dt.total_seconds()
    else:
        logger.warning(
            "Coluna 'u_first_occurrence' ausente na exportação — SLA 3.0 "
            "ficará marcado como 'sem evento' (-1) pra todas as linhas até "
            "termos uma fonte real desse timestamp."
        )
        delta = pd.Series(np.nan, index=df.index)

    df["SLA 3.0"] = delta

    def classify(v):
        if pd.isna(v) or v < 0:
            return -1
        return 1 if v >= 900 else 0

    df["Coluna"] = df["SLA 3.0"].apply(classify)
    return df


def add_region_column(df: pd.DataFrame) -> pd.DataFrame:
    """
    Column Measure = "Ibéria" / "Brasil".

    Migração 2026-08 (confirmado com dados reais de downloads/): o campo
    `company` (vindo de "Parent") já traz o país embutido no próprio
    valor — ex: "Parent-EDP BRASIL", "Parent-EDP PT", "Parent-EDP ES".
    Isso é mais direto que a lógica antiga (que cruzava company +
    u_category) — não precisa mais de "category" pra decidir região.
    ASSUNÇÃO: só vi esses 3 valores de Parent na amostra; qualquer outro
    valor cai em "Ibéria" por default.
    """
    def region(row):
        company = str(row.get("company", "") or "").upper()
        return "Brasil" if "BRASIL" in company else "Ibéria"

    df["Column Measure"] = df.apply(region, axis=1)
    return df


def filter_by_region(df: pd.DataFrame, region: str | None, parent_column: str = "Parent") -> pd.DataFrame:
    """
    Filtra um DataFrame BRUTO (antes do enrich, com a coluna 'Parent' tal
    como vem do ServiceNow) por geografia — mesma regra binária de
    add_region_column (Brasil se "BRASIL" está em Parent, senão Ibéria),
    aplicada cedo pra poder restringir GCC Abertos e SLA3(Incidentes) ao
    filtro de geografia escolhido no frontend (Global/Ibéria/Brasil).
    `region` None/"Global"/vazio não filtra nada (devolve `df` como veio).
    """
    if not region or region == "Global" or parent_column not in df.columns:
        return df
    is_brasil = df[parent_column].astype(str).str.upper().str.contains("BRASIL", na=False)
    return df[is_brasil] if region == "Brasil" else df[~is_brasil]


def add_grupo_column(df: pd.DataFrame) -> pd.DataFrame:
    """
    Grupo = "AIOPER" se channel (contact_type) == "automatic" — sinal
    oficial adicionado ao PRINCIPAL_URL pra isto (ver AIOPER_CHANNEL_VALUE
    acima). Se a coluna "channel" não vier no export (ex: dado antigo em
    backlog, ou a URL não foi atualizada), cai no fallback por nome
    (prefixo AIOPER_PREFIX).

    Senão, "Monitorização" se o nome termina em "OM" — CONFIRMADO com o
    negócio: é a convenção real de nome pra gente da Monitorização (ex:
    "Nuno Martins OM"), não uma coincidência. Comparação
    case-insensitive pra não depender de a instância manter o "OM" em
    maiúsculas sempre. Também cai em Monitorização quem estiver na lista
    fixa MONITORIZACAO_NOMES (gente cujo nome não segue essa convenção).
    Senão, "Operação".
    """
    has_channel = "channel" in df.columns
    if not has_channel:
        logger.warning(
            "Coluna 'channel' (contact_type) ausente no export — "
            "classificando AIOPER só pela heurística de nome (prefixo "
            "'%s'). Se o campo foi adicionado à URL mas o cabeçalho "
            "exportado tem outro nome, ajusta o rename em "
            "_rename_raw_columns.", AIOPER_PREFIX,
        )

    def grupo(row):
        tecnico = str(row.get("Técnico", "") or "")
        if has_channel:
            channel = str(row.get("channel", "") or "").strip().upper()
            if channel == AIOPER_CHANNEL_VALUE:
                return "AIOPER"
        if tecnico.upper().startswith(AIOPER_PREFIX):
            return "AIOPER"
        if tecnico.upper().endswith("OM") or tecnico in MONITORIZACAO_NOMES:
            return "Monitorização"
        return "Operação"

    df["Grupo"] = df.apply(grupo, axis=1)
    return df


def add_turno_column(df: pd.DataFrame) -> pd.DataFrame:
    """
    Turno = Manhã/Tarde/Noite + sufixo de nacionalidade (BR/PT), baseado na
    hora de abertura e na lista de técnicos.
    """
    def turno_base(hour, minute):
        if (hour >= 23 and minute >= 30) or hour < 7 or (hour == 7 and minute <= 30):
            return "Turno Noite"
        if (hour >= 7 and minute >= 31) or hour < 15 or (hour == 15 and minute <= 30):
            return "Turno Manhã"
        return "Turno Tarde"

    def turno(row):
        dt = row["opened_at"]
        if pd.isna(dt):
            return "Turno Intermédio"
        base = turno_base(dt.hour, dt.minute)
        tecnico = row["Técnico"]
        if tecnico in TECNICOS_BR:
            return f"{base} - BR"
        if tecnico in TECNICOS_PT:
            return f"{base} - PT"
        return "Turno Intermédio"

    df["Turno"] = df.apply(turno, axis=1)
    return df


def add_year_month_column(df: pd.DataFrame) -> pd.DataFrame:
    df["Year Month"] = df["opened_at"].dt.strftime("%Y-%m")
    return df


def _find_keyword(text: str) -> str | None:
    """Retorna a keyword (ordem alfabética, como o MIN() do DAX) contida no texto."""
    if not text or pd.isna(text):
        return None
    text_upper = str(text).upper()
    matches = [kw for kw in KEYWORD_LIST if kw in text_upper]
    return min(matches) if matches else None


def _event_id(row) -> str:
    """
    ASSUNÇÃO (migração 2026-08): a instância antiga tinha "u_ibm_event_id"
    com o identificador do evento de origem (ex: "TOOL::algo", "OEM_BKP...").
    A nova não tem esse campo — confirmado com o negócio que
    "correlation_id"/"correlation_display" fazem esse papel agora. Concateno
    os dois pra não perder sinal caso um venha vazio. Validar se o formato
    "PREFIXO::resto" (usado em Source abaixo) ainda aparece nesses campos.
    """
    correlation_id = str(row.get("correlation_id", "") or "")
    correlation_display = str(row.get("correlation_display", "") or "")
    return f"{correlation_id} {correlation_display}".strip()


def add_keyword_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Replica "Keyword Found" e "Source":
    1. OEM_BKP em correlation_id/correlation_display tem prioridade máxima
    2. Depois "Azure" (datafactory/pipeline em short_description)
    3. Depois ITSI em correlation_id/correlation_display
    4. Depois primeira keyword encontrada em short_description (SAP -> SOLMAN)
    5. Por fim, procura no próprio correlation_id/correlation_display

    ASSUNÇÃO (migração 2026-08): a instância nova não exporta "description"
    (só "short_description") nem "u_ibm_event_id" (ver _event_id acima) —
    o passo de busca em "description" foi removido por falta de campo
    equivalente.
    """
    def keyword_found(row):
        event_id = _event_id(row)
        short_desc = str(row.get("short_description", "") or "")

        if "OEM_BKP" in event_id.upper():
            return "OEM_BKP"

        if "datafactory" in short_desc.lower() or any(
            k in short_desc.lower() for k in ["data factory", "pipeline", "datafactory"]
        ):
            return "Azure"

        if "ITSI" in event_id.upper():
            return "ITSI"

        # corta o texto antes de "Event from" ou "|"
        def cut(text):
            for marker in ("Event from", "|"):
                idx = text.find(marker)
                if idx != -1:
                    text = text[:idx]
            return text

        kw = _find_keyword(cut(short_desc))
        if kw:
            return "SOLMAN" if kw == "SAP" else kw

        return _find_keyword(event_id)

    df["Keyword Found"] = df.apply(keyword_found, axis=1)

    def source(row):
        if row["Grupo"] == "Monitorização":
            return None
        event_id = _event_id(row)
        regiao = row["Column Measure"]

        base = None
        if "::" in event_id:
            prefix = event_id.split("::")[0].strip().upper()
            if prefix in KEYWORD_LIST:
                base = prefix
        if base is None:
            base = row["Keyword Found"]

        if base == "OEM" and regiao == "Ibéria":
            return "OEM PT"
        if base == "OEM" and regiao == "Brasil":
            return "OEM BR"
        if base == "SOLMAN" and regiao == "Ibéria":
            return "SOLMAN PT"
        if base == "SOLMAN" and regiao == "Brasil":
            return "SOLMAN BR"
        if base in ("ITSI_MON", "ITM"):
            return "ITSI"
        return base

    df["Source"] = df.apply(source, axis=1)
    return df


def enrich_sys_report_template(df: pd.DataFrame, justificacoes: pd.DataFrame | None = None) -> pd.DataFrame:
    """
    Pipeline completo: aplica todas as transformações na ordem correta,
    replicando o que o Power BI fazia via Power Query + colunas calculadas.

    `justificacoes`: tabela BRUTA (Incidente/texto/Aceite?, ver
    services/justificacoes_service.py) lida da tabela "justificacoes" no
    SQLite (SharePoint, JUSTIFICACOES_URL). Migração 2026-08 (RESOLVIDO):
    antes disto o parâmetro nunca era passado por nenhum call site — o
    "Justificado?" ficava sempre "não" pra todo mundo. Agora gera colunas
    SEPARADAS por SLA (Justificado SLA1/SLA2), já que a planilha real
    justifica incidentes por SLA específico, não em bloco — SLA3/SLA4 têm
    a sua própria lógica de justificação em sla_service.py, que trabalha
    sobre dataframes diferentes (SLA3(Incidentes)/SLA4), não este.
    """
    df = exclude_hidden_technicians(df.copy(), column="Opened by")
    df = exclude_canceled_incidents(df, column="State")
    df = _rename_raw_columns(df)
    df = add_sla_columns(df)
    df = add_region_column(df)
    df = add_grupo_column(df)
    df = add_turno_column(df)
    df = add_year_month_column(df)
    df = add_keyword_columns(df)

    parsed = parse_justificacoes(justificacoes)
    just_sla1 = get_justified_map(parsed, 1)
    just_sla2 = get_justified_map(parsed, 2)

    incidente = df["Incidente"].astype(str)
    df["Justificado SLA1"] = incidente.isin(just_sla1).map({True: "sim", False: "não"})
    df["Justificado SLA2"] = incidente.isin(just_sla2).map({True: "sim", False: "não"})
    # Mantido por compatibilidade — usado em quality_service.py como flag
    # geral (SLA1 OU SLA2 justificado) pro card "Justificado" do Report SLAs.
    df["Justificado?"] = ((df["Justificado SLA1"] == "sim") | (df["Justificado SLA2"] == "sim")).map(
        {True: "sim", False: "não"}
    )
    df["Justificacao Texto"] = incidente.map(lambda x: just_sla1.get(x) or just_sla2.get(x) or "")

    return df
