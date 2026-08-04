# config.py
import logging
import os
from pathlib import Path

from dotenv import load_dotenv

logger = logging.getLogger("config")

BASE_DIR = Path(__file__).resolve().parent
DOTENV_PATH = BASE_DIR / ".env"

if not DOTENV_PATH.exists():
    logger.warning("Arquivo .env NÃO encontrado em %s", DOTENV_PATH)
else:
    loaded = load_dotenv(dotenv_path=DOTENV_PATH, override=True)
    logger.info("'.env' carregado de %s (sucesso=%s)", DOTENV_PATH, loaded)


class Settings:
    # --- URLs de export CSV do ServiceNow (instância nova: edpon.service-now.com) ---
    PRINCIPAL_URL = os.getenv("PRINCIPAL_URL")  # "GCC Abertos" (incident_list.do)
    SLA3_URL = os.getenv("SLA3_URL")  # "SLA 3" — todos os P1 (incident_list.do)
    SLA4_URL = os.getenv("SLA4_URL")  # "SLA 4" — task_sla_list.do (ainda em estudo)
    OK_URL = os.getenv("OK_URL")  # "TAG OK" (label_entry_list.do)
    TAG_CALLS_GCC_URL = os.getenv("TAG_CALLS_GCC_URL")  # "TAG CALLS_GCC" (label_entry_list.do)

    # --- Desativadas por agora: sem link novo da instância edpon ainda ---
    SLA3_GROUPS_URL = os.getenv("SLA3_GROUPS_URL")
    USERS_URL = os.getenv("USERS_URL")
    AUDITKEYS_URL = os.getenv("AUDITKEYS_URL")
    DESPROMOVIDOS_URL = os.getenv("DESPROMOVIDOS_URL")
    BACKLOG_INC_URL = os.getenv("BACKLOG_INC_URL")
    BACKLOG_RITM_URL = os.getenv("BACKLOG_RITM_URL")

    CALLS_URL = os.getenv("CALLS_URL")
    JUSTIFICACOES_URL = os.getenv("JUSTIFICACOES_URL")

    # --- Credenciais ServiceNow ---
    SN_USER = os.getenv("SN_USER")
    SN_PASS = os.getenv("SN_PASS")

    # --- Nomes dos ficheiros baixados manualmente (.xls — export EXCEL) ---
    # Quando a busca automática falha, o backend procura estes nomes em
    # backend/downloads/. Preenche com o nome exato que o teu navegador
    # usa ao baixar cada URL.
    SN_FILENAME_PRINCIPAL = os.getenv("SN_FILENAME_PRINCIPAL", "PRINCIPAL_URL.xls")
    SN_FILENAME_SLA3 = os.getenv("SN_FILENAME_SLA3", "SLA3_URL.xls")
    SN_FILENAME_SLA4 = os.getenv("SN_FILENAME_SLA4", "SLA4_URL.xls")
    SN_FILENAME_SLA3_GRUPOS = os.getenv("SN_FILENAME_SLA3_GRUPOS", "sla3_grupos.xls")
    SN_FILENAME_OK = os.getenv("SN_FILENAME_OK", "OK_URL.xls")
    SN_FILENAME_TAG_CALLS_GCC = os.getenv("SN_FILENAME_TAG_CALLS_GCC", "TAG_CALLS_GCC_URL.xls")
    SN_FILENAME_USERS = os.getenv("SN_FILENAME_USERS", "users.xls")
    SN_FILENAME_AUDITKEYS = os.getenv("SN_FILENAME_AUDITKEYS", "auditkeys.xls")
    SN_FILENAME_DESPROMOVIDOS = os.getenv("SN_FILENAME_DESPROMOVIDOS", "despromovidos.xls")
    SN_FILENAME_BACKLOG_INC = os.getenv("SN_FILENAME_BACKLOG_INC", "mon_backlog_incs.xls")
    SN_FILENAME_BACKLOG_RITM = os.getenv("SN_FILENAME_BACKLOG_RITM", "mon_backlog_ritm.xls")
    # JUSTIFICACOES_URL é do SharePoint (.xlsm), não do ServiceNow — não dá
    # pra buscar automaticamente com as credenciais SN_USER/SN_PASS (ver
    # cache.py, SERVICENOW_URLS). Só é lido manualmente de downloads/.
    SN_FILENAME_JUSTIFICACOES = os.getenv("SN_FILENAME_JUSTIFICACOES", "JUSTIFICACOES_URL.xlsm")

    # --- Table REST API (reservado/futuro) ---
    _principal = os.getenv("PRINCIPAL_URL") or ""
    SN_INSTANCE_URL = _principal.split("/sys_report_template")[0] if _principal else None
    SN_INCIDENT_QUERY = os.getenv("SN_INCIDENT_QUERY", "ORDERBYDESCopened_at")
    SN_INCIDENT_LIMIT = int(os.getenv("SN_INCIDENT_LIMIT", "5000"))

    # --- Cache ---
    CACHE_REFRESH_MINUTES = int(os.getenv("CACHE_REFRESH_MINUTES", "20"))

    # --- CORS ---
    FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")


settings = Settings()

_missing = [k for k in ("PRINCIPAL_URL", "SLA3_URL", "SLA4_URL") if not getattr(settings, k)]
if _missing:
    logger.warning(
        "Variáveis em falta no .env: %s. O backend usará CSVs manuais "
        "de downloads/ enquanto estas URLs não estiverem configuradas.",
        ", ".join(_missing),
    )
