# services/sla_service.py
"""
Gera os dados de SLA3(Incidentes) e SLA4, replicando a lógica DAX real
extraída dos .tmdl (SLA3_Incidentes_.tmdl, SLA4.tmdl) — não são
aproximações. Duas colunas usadas aqui NÃO vêm prontas no CSV bruto do
ServiceNow, são calculadas:

- Region (SLA3): cruza `u_group_history` contra os nomes de
  SLA3(Grupos)[name], OU contact_type/u_communication_sent. Por isso
  get_sla3_summary() agora recebe também o DataFrame de sla3_grupos.
- DifferenceInMinutesOrNotAchieved (SLA4): detecta se uma task foi
  aberta como Crítico/P1 e foi "despromovida" (rebaixada) antes do
  atendimento, usando PriorityAtOpen + prioridade atual da task.
"""
import pandas as pd

SLA3_TARGET = 70  # 'SLA3 Target Value' no .pbix (NÃO é 95% — esse valor
                  # estava incorreto em sla_advanced_service.py)
SLA4_TARGET_THRESHOLD = 3  # 'SLA4 Threshold'

CRITICO_P1_MARKERS = ("CRITICO", "CRÍTICO", "-P1-", "-P1")


def _prepare_sla3(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df = df.loc[:, ~df.columns.duplicated()]
    df["opened_at"] = pd.to_datetime(df.get("opened_at"), errors="coerce")
    return df


def _prepare_sla4(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df = df.loc[:, ~df.columns.duplicated()]
    for col in ("start_time", "end_time", "task.opened_at"):
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")
    return df


def _compute_region(df: pd.DataFrame, grupos: pd.DataFrame) -> pd.Series:
    """
    Réplica da coluna calculada `Region` de SLA3(Incidentes).tmdl:

      tagsList = u_group_history com "," trocado por "|"
      matchedTag =
        SE contact_type in {"GCC","MSP-Operations Center (OpsMon)"}
           OU u_communication_sent = "true"
        ENTÃO "TRUE"
        SENÃO primeiro nome de SLA3(Grupos) que aparece como substring
              em tagsList (senão BLANK)
    """
    group_names = grupos["name"].dropna().astype(str).tolist() if "name" in grupos.columns else []

    def region_for_row(row) -> str | None:
        contact_type = str(row.get("contact_type", "") or "")
        comm_sent = str(row.get("u_communication_sent", "") or "").lower()
        if contact_type in ("GCC", "MSP-Operations Center (OpsMon)") or comm_sent == "true":
            return "TRUE"
        tags_list = str(row.get("u_group_history", "") or "").replace(",", "|")
        for name in group_names:
            if name and name in tags_list:
                return name
        return None

    return df.apply(region_for_row, axis=1)


def get_sla3_summary(df_sla3_raw: pd.DataFrame, df_sla3_grupos_raw: pd.DataFrame) -> dict:
    """
    Achieved     = Region preenchida E contact_type in {"MSP-Operations Center (OpsMon)", "GCC"}
    Not Achieved = Region preenchida E contact_type fora dessa lista E Justificado SLA3? != "sim"
    Justificados = Justificado SLA3? == "sim"
    SLA3%        = Achieved / (Achieved + Not Achieved + Justificados) * 100
    """
    df = _prepare_sla3(df_sla3_raw)
    df["Region"] = _compute_region(df, df_sla3_grupos_raw)

    # Justificado SLA3? depende da tabela Justificações (SharePoint, fora
    # do escopo) — sem ela, assume "não" pra todo mundo.
    justificado = pd.Series("não", index=df.index)

    has_region = df["Region"].notna()
    contact_ok = df.get("contact_type", pd.Series(dtype=str)).isin(
        ["MSP-Operations Center (OpsMon)", "GCC"]
    )
    is_justificado = justificado.eq("sim")

    achieved = int((has_region & contact_ok).sum())
    not_achieved = int((has_region & ~contact_ok & ~is_justificado).sum())
    justificados = int(is_justificado.sum())

    denom = achieved + not_achieved + justificados
    sla3_pct = round((achieved / denom) * 100, 1) if denom else 0.0

    return {
        "achieved": achieved,
        "not_achieved": not_achieved,
        "justificados": justificados,
        "sla3_pct": sla3_pct,
        "target": SLA3_TARGET,
        "target_value": SLA3_TARGET,  # alias — AdvancedSla.jsx espera este nome
    }


def _contains_any(text: str, markers: tuple) -> bool:
    text_upper = str(text or "").upper()
    return any(m in text_upper for m in markers)


def _compute_sla4_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Réplica de IsFirstSLA -> ContainsCriticoOrP1 -> PriorityAtOpen -> DifferenceInMinutesOrNotAchieved."""
    df = df.copy()

    diff_seconds = (df["start_time"] - df["task.opened_at"]).dt.total_seconds().abs()
    df["_is_first_sla"] = diff_seconds <= 1

    df["_contains_critico_p1"] = df["sla"].apply(lambda s: _contains_any(s, CRITICO_P1_MARKERS))
    df["_has_critico_p1_in_task"] = df.groupby("task")["_contains_critico_p1"].transform("any")

    def priority_at_open(row):
        if not row["_is_first_sla"]:
            return None
        sla_upper = str(row.get("sla", "") or "").upper()
        if _contains_any(sla_upper, CRITICO_P1_MARKERS):
            return "1 - CRITICAL"
        if "VIP" in sla_upper and row["_has_critico_p1_in_task"]:
            return "1 - CRITICAL"
        if "VIP" in sla_upper:
            return "2 - HIGH"
        if "HIGH" in sla_upper:
            return "2 - HIGH"
        if "MEDIUM" in sla_upper:
            return "3 - MEDIUM"
        if "LOW" in sla_upper:
            return "4 - LOW"
        return None

    df["_priority_at_open"] = df.apply(priority_at_open, axis=1)

    def difference_result(row):
        is_at_open = row["_is_first_sla"]
        is_critico_at_open = "CRITICAL" in str(row["_priority_at_open"] or "").upper()
        this_priority = str(row.get("task.priority", "") or "")
        contains_critico_p1 = row["_contains_critico_p1"]

        if is_critico_at_open and is_at_open:
            if "CRITICAL" not in this_priority.upper():
                return "Not Achieved"  # despromovido depois de aberto
            return "Achieved"
        if not is_critico_at_open and contains_critico_p1:
            return "Achieved"
        return None

    df["DifferenceInMinutesOrNotAchieved"] = df.apply(difference_result, axis=1)
    return df


def get_sla4_summary(df_sla4_raw: pd.DataFrame) -> dict:
    """
    SLA4 Count = nº de tasks distintas onde o valor MÁXIMO (alfabético —
    "Not Achieved" > "Achieved") de DifferenceInMinutesOrNotAchieved é
    "Not Achieved", e não justificado.
    """
    df = _prepare_sla4(df_sla4_raw)
    df = _compute_sla4_columns(df)

    df["Justificado SLA4?"] = "não"  # sem fonte Justificações ainda

    per_task_max = (
        df.dropna(subset=["DifferenceInMinutesOrNotAchieved"])
        .groupby("task")["DifferenceInMinutesOrNotAchieved"]
        .max()
    )
    bad_tasks_all = set(per_task_max[per_task_max == "Not Achieved"].index)
    justified_tasks = set(df.loc[df["Justificado SLA4?"] == "sim", "task"].unique())
    bad_tasks_not_justified = bad_tasks_all - justified_tasks

    count = len(bad_tasks_not_justified)
    return {
        "sla4_not_achieved": count,
        "sla4_count": count,  # alias — AdvancedSla.jsx espera este nome
        "sla4_justificados": len(justified_tasks),
        "threshold_minutes": SLA4_TARGET_THRESHOLD,
    }


def get_sla_overview(df_sla3_raw: pd.DataFrame, df_sla4_raw: pd.DataFrame, df_sla3_grupos_raw: pd.DataFrame) -> dict:
    """Combina SLA3 + SLA4 num único payload para a página SLA.jsx."""
    return {
        "sla3": get_sla3_summary(df_sla3_raw, df_sla3_grupos_raw),
        "sla4": get_sla4_summary(df_sla4_raw),
    }
