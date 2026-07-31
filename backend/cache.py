# cache.py
"""
Job de atualização em background. A cada ciclo:

  1. Tenta baixar cada relatório CSV do ServiceNow automaticamente via
     services/servicenow_client.py (cliente robusto).
  2. Para qualquer tabela que falhar na busca automática, verifica se já
     existe um CSV em downloads/ — quer tenha sido baixado com o nome
     padrão do ServiceNow (ex: "sys_report_template.do.csv") ou já com o
     nome correto da tabela (ex: "sys_report_template.csv"). O mapeamento
     de nomes é lido do .env (SN_FILENAME_*) — ver .env.example.
  3. Salva cada DataFrame obtido (automático ou manual) no SQLite
     (dashboard.db) e remove o CSV de downloads/ assim que o commit é
     confirmado.
  4. Usa os DataFrames pra calcular tudo que a API expõe e guarda em CACHE.

Fluxo prático pro caminho manual:
  - Baixa o CSV pelo navegador (abre a URL do .env logado no ServiceNow)
  - O ficheiro fica em Downloads/ com o nome que o ServiceNow der
  - Move pra backend/downloads/ (não precisa renomear — o backend encontra
    pelo mapeamento SN_FILENAME_* do .env)
  - No próximo ciclo (ou reiniciando o servidor) o backend detecta,
    processa e apaga automaticamente

O scheduler roda esse ciclo a cada CACHE_REFRESH_MINUTES (padrão 20) e
também uma vez assim que a app sobe.
"""
import logging
import sqlite3
import threading
from datetime import datetime
from pathlib import Path

import pandas as pd
from apscheduler.schedulers.background import BackgroundScheduler

from config import settings
from services import dashboard_service, incidents_service, operators_service, sla_service
from services.servicenow_client import ServiceNowFetchError, _parse_csv_text, fetch_csv
from services.transform import enrich_sys_report_template

logger = logging.getLogger("cache")

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "dashboard.db"
DOWNLOADS_DIR = BASE_DIR / "downloads"

# Mapeia nome da tabela -> possíveis nomes de ficheiro em downloads/.
# A lista de candidatos por tabela é construída com:
#   1. O nome configurado no .env (SN_FILENAME_{TABLE}) — preenche pra
#      bater com o nome exato que o teu navegador usa ao baixar.
#   2. O nome padrão "{tabela}.csv" — fallback se não configurado no .env.
#   3. O nome típico do export do ServiceNow por URL.
def _build_filename_candidates() -> dict[str, list[str]]:
    tables = {
        "sys_report_template": [
            settings.SN_FILENAME_PRINCIPAL,
            "sys_report_template.csv",
            "sys_report_template.do.csv",
        ],
        "sla3_incidentes": [
            settings.SN_FILENAME_SLA3,
            "sla3_incidentes.csv",
        ],
        "sla4": [
            settings.SN_FILENAME_SLA4,
            "sla4.csv",
        ],
        "sla3_grupos": [
            settings.SN_FILENAME_SLA3_GRUPOS,
            "sla3_grupos.csv",
            "sys_user_group_list.do.csv",
        ],
        "ok_": [
            settings.SN_FILENAME_OK,
            "ok_.csv",
        ],
        "users": [
            settings.SN_FILENAME_USERS,
            "users.csv",
            "sys_user_grmember_list.do.csv",
        ],
        "auditkeys": [
            settings.SN_FILENAME_AUDITKEYS,
            "auditkeys.csv",
        ],
        "despromovidos": [
            settings.SN_FILENAME_DESPROMOVIDOS,
            "despromovidos.csv",
        ],
        "mon_backlog_incs": [
            settings.SN_FILENAME_BACKLOG_INC,
            "mon_backlog_incs.csv",
        ],
        "mon_backlog_ritm": [
            settings.SN_FILENAME_BACKLOG_RITM,
            "mon_backlog_ritm.csv",
        ],
    }
    # Remove None/vazios de cada lista
    return {k: [n for n in v if n] for k, v in tables.items()}


SERVICENOW_URLS = {
    "sys_report_template": lambda: settings.PRINCIPAL_URL,
    "sla3_incidentes": lambda: settings.SLA3_URL,
    "sla4": lambda: settings.SLA4_URL,
    "sla3_grupos": lambda: settings.SLA3_GROUPS_URL,
    "ok_": lambda: settings.OK_URL,
    "users": lambda: settings.USERS_URL,
    "auditkeys": lambda: settings.AUDITKEYS_URL,
    "despromovidos": lambda: settings.DESPROMOVIDOS_URL,
    "mon_backlog_incs": lambda: settings.BACKLOG_INC_URL,
    "mon_backlog_ritm": lambda: settings.BACKLOG_RITM_URL,
}

CACHE: dict = {"errors": {}, "last_updated": None}


def _read_csv_file(path: Path) -> pd.DataFrame:
    """Lê um CSV tentando os encodings mais comuns do export do ServiceNow."""
    for encoding in ("utf-8-sig", "cp1252", "latin-1", "utf-8"):
        try:
            text = path.read_text(encoding=encoding)
            return _parse_csv_text(text, str(path))
        except (UnicodeDecodeError, ServiceNowFetchError):
            continue
    raise ServiceNowFetchError(f"Não consegui ler {path.name} (encoding não reconhecido).")


def _find_manual_csv(table_name: str, candidates: list[str]) -> Path | None:
    """
    Procura em downloads/ pelos nomes candidatos (do .env ou padrões).
    Devolve o Path do primeiro que encontrar, ou None.
    """
    for name in candidates:
        path = DOWNLOADS_DIR / name
        if path.exists():
            return path
    return None


def fetch_and_download_csvs() -> tuple[dict, dict]:
    """
    Busca cada relatório: tenta a via automática primeiro; se falhar,
    procura o CSV manual em downloads/ (por qualquer nome candidato)
    antes de desistir de vez.
    """
    DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
    filename_candidates = _build_filename_candidates()
    dfs: dict = {}
    errors: dict = {}

    for table_name, url_getter in SERVICENOW_URLS.items():
        url = url_getter()
        auto_error = None

        if url:
            try:
                logger.info("A descarregar '%s' automaticamente...", table_name)
                df = fetch_csv(url)
                dfs[table_name] = df
                # Salva uma cópia com o nome padrão pra auditoria
                df.to_csv(DOWNLOADS_DIR / f"{table_name}.csv", index=False)
                logger.info("'%s' obtido automaticamente (%d linhas).", table_name, len(df))
                continue
            except ServiceNowFetchError as exc:
                logger.error("Falha automática em '%s': %s", table_name, exc)
                auto_error = str(exc)
            except Exception as exc:  # noqa: BLE001
                logger.exception("Erro inesperado ao baixar '%s'", table_name)
                auto_error = str(exc)
        else:
            logger.warning("URL para '%s' não definida no .env — só tenta CSV manual.", table_name)

        # Tenta o CSV manual em downloads/ (qualquer nome candidato)
        candidates = filename_candidates.get(table_name, [f"{table_name}.csv"])
        manual_path = _find_manual_csv(table_name, candidates)

        if manual_path:
            try:
                age_minutes = (datetime.now().timestamp() - manual_path.stat().st_mtime) / 60
                df = _read_csv_file(manual_path)
                dfs[table_name] = df
                logger.warning(
                    "Usando CSV MANUAL para '%s': ficheiro '%s' "
                    "(%.0f min de idade, %d linhas). "
                    "Não é dado em tempo real.",
                    table_name, manual_path.name, age_minutes, len(df),
                )
            except ServiceNowFetchError as exc:
                errors[table_name] = f"CSV manual encontrado mas não legível: {exc}"
        else:
            searched = ", ".join(f"'{c}'" for c in candidates[:3])
            errors[table_name] = (
                (auto_error or "Sem URL configurada") +
                f" | Sem CSV manual em downloads/ (procurei: {searched})"
            )

    return dfs, errors


def _store_and_clean_csvs(dfs: dict) -> dict:
    """Grava cada DataFrame no SQLite e remove o CSV correspondente de downloads/."""
    errors: dict = {}
    if not dfs:
        return errors

    filename_candidates = _build_filename_candidates()
    conn = sqlite3.connect(DB_PATH)
    try:
        for table_name, df in dfs.items():
            try:
                df_to_store = df.copy()
                df_to_store["extracted_at"] = pd.Timestamp.now()
                df_to_store.to_sql(table_name, conn, if_exists="replace", index=False)
                conn.commit()

                # Remove todos os ficheiros candidatos que existirem
                candidates = filename_candidates.get(table_name, [f"{table_name}.csv"])
                for name in candidates:
                    (DOWNLOADS_DIR / name).unlink(missing_ok=True)
                # Também remove o ficheiro padrão de auditoria se sobrou
                (DOWNLOADS_DIR / f"{table_name}.csv").unlink(missing_ok=True)

                logger.info("'%s' salvo no SQLite e ficheiros removidos de downloads/.", table_name)
            except Exception as exc:  # noqa: BLE001
                logger.exception("Erro ao salvar '%s' no SQLite", table_name)
                errors[table_name] = str(exc)
    finally:
        conn.close()

    return errors


def _compute_derived_cache(dfs: dict) -> tuple[dict, dict]:
    result: dict = {}
    errors: dict = {}

    raw_principal = dfs.get("sys_report_template")
    principal_keys = (
        "kpis", "priority_breakdown", "tools_breakdown",
        "incidents_summary", "operators_summary", "quality_metrics",
    )
    if raw_principal is not None:
        try:
            enriched = enrich_sys_report_template(raw_principal)
            result["kpis"] = dashboard_service.get_kpis(enriched)
            result["priority_breakdown"] = dashboard_service.get_priority_breakdown(enriched)
            result["tools_breakdown"] = dashboard_service.get_tools_breakdown(enriched)
            result["incidents_summary"] = incidents_service.get_incidents_summary(enriched)
            result["operators_summary"] = operators_service.get_operators_summary(enriched)
            from services import quality_service
            result["quality_metrics"] = quality_service.get_quality_metrics(enriched)
        except Exception as exc:  # noqa: BLE001
            msg = f"Falha ao calcular métricas: {type(exc).__name__}: {exc}"
            logger.exception(msg)
            for key in principal_keys:
                errors[key] = msg
    else:
        msg = "CSV 'sys_report_template' indisponível neste ciclo."
        for key in principal_keys:
            errors[key] = msg

    raw_sla3 = dfs.get("sla3_incidentes")
    raw_sla4 = dfs.get("sla4")
    raw_sla3_grupos = dfs.get("sla3_grupos")
    sla_keys = ("sla_overview", "sla3_detailed", "sla4_detailed")
    if raw_sla3 is not None and raw_sla4 is not None and raw_sla3_grupos is not None:
        try:
            result["sla_overview"] = sla_service.get_sla_overview(raw_sla3, raw_sla4, raw_sla3_grupos)
            result["sla3_detailed"] = result["sla_overview"]["sla3"]
            result["sla4_detailed"] = result["sla_overview"]["sla4"]
        except Exception as exc:  # noqa: BLE001
            msg = f"Falha ao calcular SLA3/SLA4: {type(exc).__name__}: {exc}"
            logger.exception(msg)
            for key in sla_keys:
                errors[key] = msg
    else:
        missing = [n for n, d in (("sla3_incidentes", raw_sla3), ("sla4", raw_sla4), ("sla3_grupos", raw_sla3_grupos)) if d is None]
        for key in sla_keys:
            errors[key] = f"CSVs indisponíveis: {', '.join(missing)}"

    raw_backlog_inc = dfs.get("mon_backlog_incs")
    raw_backlog_ritm = dfs.get("mon_backlog_ritm")
    if raw_backlog_inc is not None or raw_backlog_ritm is not None:
        try:
            from services import backlog_service
            result["backlog_summary"] = backlog_service.get_backlog_summary(raw_backlog_inc, raw_backlog_ritm)
        except Exception as exc:  # noqa: BLE001
            errors["backlog_summary"] = f"Erro no cálculo de Backlog: {exc}"
    else:
        errors["backlog_summary"] = "CSVs de backlog indisponíveis."

    raw_despromovidos = dfs.get("despromovidos")
    if raw_despromovidos is not None:
        try:
            from services import audit_service
            result["despromovidos_summary"] = audit_service.get_despromovidos_metrics(raw_despromovidos)
        except Exception as exc:  # noqa: BLE001
            errors["despromovidos_summary"] = f"Erro em Despromovidos: {exc}"
    else:
        errors["despromovidos_summary"] = "CSV 'despromovidos' indisponível."

    return result, errors


def refresh_all():
    logger.info("=== Iniciando ciclo de atualização do cache ===")

    dfs, download_errors = fetch_and_download_csvs()
    store_errors = _store_and_clean_csvs(dfs)
    derived, compute_errors = _compute_derived_cache(dfs)

    all_errors = {**download_errors, **store_errors, **compute_errors}
    CACHE.update(derived)
    CACHE["errors"] = all_errors
    CACHE["last_updated"] = datetime.now().isoformat()

    if all_errors:
        logger.warning("Ciclo concluído com %d erro(s): %s", len(all_errors), list(all_errors.keys()))
    else:
        logger.info("Ciclo concluído sem erros. ✓")


def start_scheduler():
    scheduler = BackgroundScheduler()
    scheduler.add_job(
        refresh_all, "interval",
        minutes=settings.CACHE_REFRESH_MINUTES,
        id="servicenow_sync_job",
    )
    threading.Thread(target=refresh_all, daemon=True, name="initial-refresh").start()
    scheduler.start()
    logger.info("Scheduler iniciado — ciclos a cada %d min.", settings.CACHE_REFRESH_MINUTES)
