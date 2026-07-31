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
    # --- URLs de export CSV do ServiceNow ---
    PRINCIPAL_URL = os.getenv("PRINCIPAL_URL")
    SLA3_URL = os.getenv("SLA3_URL")
    SLA4_URL = os.getenv("SLA4_URL")
    SLA3_GROUPS_URL = os.getenv("SLA3_GROUPS_URL")
    OK_URL = os.getenv("OK_URL")
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

    # --- Nomes dos ficheiros CSV baixados manualmente ---
    # Quando a busca automática falha, o backend procura estes nomes em
    # backend/downloads/. Preenche com o nome exato que o teu navegador
    # usa ao baixar cada URL (ex: o ServiceNow às vezes nomeia o ficheiro
    # como o ID do relatório ou com sufixo .do.csv).
    # Se não preencheres, o backend procura por "{tabela}.csv" (que é o
    # nome que usaste manualmente e que já funcionou).
    SN_FILENAME_PRINCIPAL = os.getenv("SN_FILENAME_PRINCIPAL", "sys_report_template.csv")
    SN_FILENAME_SLA3 = os.getenv("SN_FILENAME_SLA3", "sla3_incidentes.csv")
    SN_FILENAME_SLA4 = os.getenv("SN_FILENAME_SLA4", "sla4.csv")
    SN_FILENAME_SLA3_GRUPOS = os.getenv("SN_FILENAME_SLA3_GRUPOS", "sla3_grupos.csv")
    SN_FILENAME_OK = os.getenv("SN_FILENAME_OK", "ok_.csv")
    SN_FILENAME_USERS = os.getenv("SN_FILENAME_USERS", "users.csv")
    SN_FILENAME_AUDITKEYS = os.getenv("SN_FILENAME_AUDITKEYS", "auditkeys.csv")
    SN_FILENAME_DESPROMOVIDOS = os.getenv("SN_FILENAME_DESPROMOVIDOS", "despromovidos.csv")
    SN_FILENAME_BACKLOG_INC = os.getenv("SN_FILENAME_BACKLOG_INC", "mon_backlog_incs.csv")
    SN_FILENAME_BACKLOG_RITM = os.getenv("SN_FILENAME_BACKLOG_RITM", "mon_backlog_ritm.csv")

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
