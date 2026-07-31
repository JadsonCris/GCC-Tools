# services/transform.py
"""
Replica em pandas as colunas calculadas (DAX) e transformações (Power Query)
que o Power BI aplicava sobre a tabela `sys_report_template` (PRINCIPAL_URL).

Cada função abaixo corresponde a UMA coluna calculada do modelo original.
Os nomes das colunas de saída foram mantidos em português/PT-BR, iguais
aos do .pbix, para facilitar o rastreio caso precises comparar com o
relatório original.
"""
import re

import numpy as np
import pandas as pd

from .keywords import KEYWORD_LIST

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

MONITORIZACAO_NOMES = {
    "DENIS TEXEIRA CLARANET",
    "Nuno Miguel Melo Machado Azevedo Martins Claranet",
}


def _rename_raw_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Espelha a etapa de Power Query:
      number -> Incidente
      opened_by -> Técnico
    e remove colunas que o Power BI descartava (mantemos aqui pois não
    atrapalham, mas o rename é necessário pois o resto do código depende
    desses nomes).
    """
    df = df.rename(columns={"number": "Incidente", "opened_by": "Técnico"})
    return df


def add_sla_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    SLA 3.0 = diferença em segundos entre u_ibm_event_id_first_occurrence e opened_at
    Coluna   = -1 (sem evento) / 1 (NOK, >=900s) / 0 (OK, <900s)
    """
    df["opened_at"] = pd.to_datetime(df["opened_at"], errors="coerce")
    df["u_ibm_event_id_first_occurrence"] = pd.to_datetime(
        df["u_ibm_event_id_first_occurrence"], errors="coerce"
    )

    delta = (df["opened_at"] - df["u_ibm_event_id_first_occurrence"]).dt.total_seconds()
    df["SLA 3.0"] = delta

    def classify(v):
        if pd.isna(v) or v < 0:
            return -1
        return 1 if v >= 900 else 0

    df["Coluna"] = df["SLA 3.0"].apply(classify)
    return df


def add_region_column(df: pd.DataFrame) -> pd.DataFrame:
    """
    Column Measure = "Ibéria" / "Brasil", baseado em company + se
    u_category contém "_BR".
    """
    def region(row):
        company = str(row.get("company", ""))
        category = str(row.get("u_category", ""))
        if company in ("EDP", "EDPR", "HC"):
            return "Brasil" if "_BR" in category else "Ibéria"
        return "Brasil"

    df["Column Measure"] = df.apply(region, axis=1)
    return df


def add_grupo_column(df: pd.DataFrame) -> pd.DataFrame:
    """
    Grupo = "Monitorização" se o técnico termina em "OM" ou está na lista
    fixa de monitorização; senão "Operação".
    """
    def grupo(tecnico):
        tecnico = str(tecnico)
        if tecnico.endswith("OM") or tecnico in MONITORIZACAO_NOMES:
            return "Monitorização"
        return "Operação"

    df["Grupo"] = df["Técnico"].apply(grupo)
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


def add_keyword_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Replica "Keyword Found" e "Source":
    1. OEM_BKP no u_ibm_event_id tem prioridade máxima
    2. Depois "Azure" (datafactory/pipeline em short_description/description)
    3. Depois ITSI no u_ibm_event_id
    4. Depois primeira keyword encontrada em short_description (SAP -> SOLMAN)
    5. Depois primeira keyword encontrada em description (SAP -> SOLMAN)
    6. Por fim, procura no próprio u_ibm_event_id
    """
    def keyword_found(row):
        event_id = str(row.get("u_ibm_event_id", "") or "")
        short_desc = str(row.get("short_description", "") or "")
        desc = str(row.get("description", "") or "")

        if "OEM_BKP" in event_id.upper():
            return "OEM_BKP"

        if "datafactory" in short_desc.lower() or any(
            k in desc.lower() for k in ["data factory", "pipeline", "datafactory"]
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

        kw = _find_keyword(cut(desc))
        if kw:
            return "SOLMAN" if kw == "SAP" else kw

        return _find_keyword(event_id)

    df["Keyword Found"] = df.apply(keyword_found, axis=1)

    def source(row):
        if row["Grupo"] == "Monitorização":
            return None
        event_id = str(row.get("u_ibm_event_id", "") or "")
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
    """
    df = _rename_raw_columns(df.copy())
    df = add_sla_columns(df)
    df = add_region_column(df)
    df = add_grupo_column(df)
    df = add_turno_column(df)
    df = add_year_month_column(df)
    df = add_keyword_columns(df)

    if justificacoes is not None and "Incidente" in justificacoes.columns:
        justificados = set(justificacoes["Incidente"].dropna().astype(str))
        df["Justificado?"] = df["Incidente"].astype(str).apply(
            lambda x: "sim" if x in justificados else "não"
        )
    else:
        # Sem a tabela de Justificações (vem do SharePoint), assume "não"
        df["Justificado?"] = "não"

    return df
