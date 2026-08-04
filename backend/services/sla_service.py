# services/sla_service.py
"""
Gera os dados de SLA3(Incidentes) e SLA4.

MIGRAÇÃO 2026-08 (instância edpon.service-now.com): a lógica de SLA3
mudou por completo em relação à versão portada do .pbix original — não é
mais réplica do DAX antigo (a tabela SLA3(Grupos) e os campos
contact_type/u_communication_sent/u_group_history não existem mais na
exportação nova). A nova definição (confirmada com o negócio):

  SLA3% = (nº de incidentes P1 que também aparecem na lista "GCC Abertos",
           cruzando por `number`) / (total de incidentes P1) * 100
  Meta: 70%.

SLA4 (migração 2026-08, RESOLVIDO): o SLA4_URL foi corrigido pra incluir
o campo "sla" (sai no export como "SLA definition") — é o nome da
definição de SLA anexada a cada linha de task_sla_list.do, e contém a
prioridade embutida no texto (ex: "DGU-ADMO-SLA-INC-RES-P3+P4-SGCC-SENV",
"DGU_EDP-SLA-INC-Prioridade Nível 3- IO (TResol)"). Lógica confirmada com
o negócio: pra cada task (=incidente), ordena as linhas de SLA por
"Start time"; se a PRIMEIRA linha é de prioridade 1 (P1/Nível 1) e
QUALQUER linha seguinte é de prioridade diferente, conta como SLA4
quebrado (P1 aberto e despromovido depois).
"""
import re

import pandas as pd

from .justificacoes_service import get_justified_map

SLA3_TARGET = 70  # 'SLA3 Target Value' no .pbix (NÃO é 95% — esse valor
                  # estava incorreto em sla_advanced_service.py)
SLA3_THRESHOLD_PCT = 30  # linha de referência do gráfico SLA3 (100 - meta 70%)
SLA4_TARGET_THRESHOLD = 3  # 'SLA4 Threshold'

# Casa "P1"/"P2"/"P3"/"P4" (com ou sem separador antes, tipo "-P3-",
# "P3+P4", "IP3") OU "Nível N"/"Nivel N" (convenção "Prioridade Nível 3").
# Fecha em \b pra não confundir a prioridade com outros números da string
# (ex: "SLA10" não pode virar prioridade 1 e 0).
_PRIORITY_PATTERN = re.compile(r"P([1-4])\b|N[íi]vel\s*([1-4])", re.IGNORECASE)


def _extract_priorities(sla_definition) -> list[int]:
    """Todas as prioridades mencionadas no nome da definição de SLA (pode ter mais de uma, ex: "P3+P4")."""
    if not sla_definition or pd.isna(sla_definition):
        return []
    priorities = []
    for m1, m2 in _PRIORITY_PATTERN.findall(str(sla_definition)):
        num = m1 or m2
        if num:
            priorities.append(int(num))
    return priorities


def _min_priority(sla_definition) -> int | None:
    """A prioridade mais severa (menor número) mencionada — ex: "P3+P4" -> 3."""
    priorities = _extract_priorities(sla_definition)
    return min(priorities) if priorities else None


def _prepare_sla4(df: pd.DataFrame) -> pd.DataFrame:
    """
    Renomeia os cabeçalhos REAIS da exportação EXCEL de task_sla_list.do
    (confirmados em backend/downloads/SLA4_URL.xls, após o SLA4_URL ser
    corrigido pra incluir o campo "sla") pros nomes internos usados
    abaixo.
    """
    df = df.copy()
    df = df.loc[:, ~df.columns.duplicated()]
    df = df.rename(columns={
        "Task": "task",
        "Created": "created",
        "SLA definition": "sla_definition",
        "Type": "type",
        "Stage": "stage",
        "Start time": "start_time",
        "Stop time": "stop_time",
        "Business elapsed time": "business_duration",
        "Business elapsed percentage": "business_percentage",
        "Active": "active",
        "Schedule": "schedule",
        "Created by": "created_by",
    })
    for col in ("created", "start_time", "stop_time"):
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")
    if "sla_definition" in df.columns:
        df["_priority"] = df["sla_definition"].apply(_min_priority)
    return df


def get_sla3_summary(
    df_sla3_raw: pd.DataFrame,
    df_gcc_abertos_raw: pd.DataFrame,
    justificacoes_parsed: pd.DataFrame | None = None,
) -> dict:
    """
    SLA3% = incidentes P1 (lista "SLA 3") que também aparecem na lista
    "GCC Abertos" (match por `Number` — cabeçalho real confirmado em
    backend/downloads/SLA3_URL.xls e PRINCIPAL_URL.xls), dividido pelo
    total de P1s. Meta: 70%. Estas dataframes são as brutas (antes de
    `enrich_sys_report_template`), por isso o cabeçalho é "Number" com N
    maiúsculo, não "Incidente".

    `justificacoes_parsed` (migração 2026-08, RESOLVIDO): DataFrame já
    normalizado por justificacoes_service.parse_justificacoes. P1s que
    não bateram com "GCC Abertos" (not_achieved) mas têm justificação
    aceite pra SLA3 saem de "not_achieved" e entram em "justificados" —
    "não conta o SLA referido na tabela", igual ao pedido pro SLA2. O
    "sla3_pct" continua a ser o número BRUTO (achieved/total), sem
    ajuste pelas justificações — mesmo critério usado no SLA2.
    """
    p1_numbers = df_sla3_raw.get("Number", pd.Series(dtype=str)).dropna().astype(str)
    total = len(p1_numbers)

    gcc_numbers = set(
        df_gcc_abertos_raw.get("Number", pd.Series(dtype=str)).dropna().astype(str)
    )

    achieved_mask = p1_numbers.isin(gcc_numbers)
    achieved = int(achieved_mask.sum())
    not_achieved_numbers = p1_numbers[~achieved_mask]

    if justificacoes_parsed is not None:
        just_sla3 = get_justified_map(justificacoes_parsed, 3)
        justificados = int(not_achieved_numbers.isin(just_sla3).sum())
    else:
        justificados = 0
    not_achieved = len(not_achieved_numbers) - justificados

    sla3_pct = round((achieved / total) * 100, 1) if total else 0.0

    return {
        "achieved": achieved,
        "not_achieved": not_achieved,
        "justificados": justificados,
        "sla3_pct": sla3_pct,
        "target": SLA3_TARGET,
        "target_value": SLA3_TARGET,  # alias — AdvancedSla.jsx espera este nome
        "threshold_pct": SLA3_THRESHOLD_PCT,
        "threshold_count": round(total * SLA3_THRESHOLD_PCT / 100, 1),
        # False quando não há NENHUM P1 no período escolhido — nesse caso
        # "0%" não é uma medida real de incumprimento, é ausência de dado.
        "available": total > 0,
    }


def _compute_sla4_from_prepared(df: pd.DataFrame) -> dict:
    """
    Pra cada task (=incidente), ordena as linhas de SLA por "start_time"
    e olha a prioridade extraída de "sla_definition" (ver _min_priority):
    se a PRIMEIRA linha é prioridade 1 e QUALQUER linha seguinte é de
    prioridade diferente, a task conta como "P1 despromovido" (SLA4
    quebrado). `total_tasks` aqui é o total de tasks que abriram como P1
    (denominador natural da métrica), não o total geral de tasks.
    """
    if "task" not in df.columns or "_priority" not in df.columns:
        return {
            "sla4_not_achieved": 0, "sla4_count": 0, "sla4_justificados": 0,
            "threshold_minutes": SLA4_TARGET_THRESHOLD, "total_tasks": 0,
            "is_pending_validation": False, "available": False,
        }

    bad_tasks = set()
    p1_tasks = set()

    for task, group in df.dropna(subset=["_priority", "start_time"]).groupby("task"):
        priorities = group.sort_values("start_time")["_priority"].tolist()
        if not priorities or priorities[0] != 1:
            continue
        p1_tasks.add(task)
        if any(p != 1 for p in priorities[1:]):
            bad_tasks.add(task)

    count = len(bad_tasks)
    return {
        "sla4_not_achieved": count,
        "sla4_count": count,  # alias — AdvancedSla.jsx espera este nome
        "sla4_justificados": 0,
        "threshold_minutes": SLA4_TARGET_THRESHOLD,
        "total_tasks": len(p1_tasks),
        "is_pending_validation": False,
        "available": len(p1_tasks) > 0,
    }


def get_sla4_summary(df_sla4_raw: pd.DataFrame) -> dict:
    """
    SLA4 = incidentes P1 (primeira task de SLA com prioridade 1) que
    foram despromovidos pra outra prioridade depois — ver
    _compute_sla4_from_prepared pra lógica exata, confirmada com o
    negócio em 2026-08.
    """
    df = _prepare_sla4(df_sla4_raw)
    return _compute_sla4_from_prepared(df)


def _region_for_parent(value) -> str:
    """Mesma regra de transform.add_region_column, aplicada ao campo bruto "Parent"."""
    return "Brasil" if "BRASIL" in str(value or "").upper() else "Ibéria"


def get_sla3_by_region(
    df_sla3_raw: pd.DataFrame,
    df_gcc_abertos_raw: pd.DataFrame,
    justificacoes_parsed: pd.DataFrame | None = None,
) -> dict:
    """
    SLA3 quebrado por região (Ibéria/Brasil) — detalhe extra pedido pro
    Report SLAs. Região vem do campo bruto "Parent" de cada P1 (mesma
    regra usada em transform.add_region_column, mas aqui aplicada antes
    do enrich porque df_sla3_raw é a tabela bruta).
    """
    if df_sla3_raw.empty or "Parent" not in df_sla3_raw.columns:
        return {}
    regions = df_sla3_raw["Parent"].apply(_region_for_parent)
    return {
        region_name: get_sla3_summary(df_sla3_raw[regions == region_name], df_gcc_abertos_raw, justificacoes_parsed)
        for region_name in sorted(regions.unique())
    }


def get_sla4_by_region(df_sla4_raw: pd.DataFrame, df_gcc_abertos_enriched: pd.DataFrame) -> dict:
    """
    SLA4 quebrado por região. A exportação de task_sla_list.do não traz
    região direta — cruza "task" (número do incidente) com "Coluna
    Measure" (região) já calculada no gcc_abertos ENRIQUECIDO (precisa
    ser o enriquecido, não o bruto, porque "Column Measure" só existe
    depois do enrich_sys_report_template).
    """
    df = _prepare_sla4(df_sla4_raw)
    if "task" not in df.columns or df_gcc_abertos_enriched.empty:
        return {}
    region_map = df_gcc_abertos_enriched.set_index("Incidente")["Column Measure"].to_dict()
    df = df.copy()
    df["_region"] = df["task"].map(region_map)
    df = df[df["_region"].notna()]
    if df.empty:
        return {}
    return {
        region_name: _compute_sla4_from_prepared(df[df["_region"] == region_name])
        for region_name in sorted(df["_region"].unique())
    }


def get_sla_overview(df_sla3_raw: pd.DataFrame, df_sla4_raw: pd.DataFrame, df_gcc_abertos_raw: pd.DataFrame) -> dict:
    """Combina SLA3 + SLA4 num único payload para a página SLA.jsx."""
    return {
        "sla3": get_sla3_summary(df_sla3_raw, df_gcc_abertos_raw),
        "sla4": get_sla4_summary(df_sla4_raw),
    }
