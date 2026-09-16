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
    # INCS_CALLS_GCC_URL = incidentes com a tag Calls_GCC (incident_list.do) —
    # RENOMEADO 2026-08 de "TAG_CALLS_GCC_URL" (que era label_entry_list.do,
    # nível de evento/tag, não de incidente) pro export atual, incidente a
    # incidente — mesma forma de PRINCIPAL_URL. Ver cache.py.
    INCS_CALLS_GCC_URL = os.getenv("INCS_CALLS_GCC_URL")
    # CI_URL = Configuration Items associados a incidentes (task_ci) — 3º
    # indicador da Atividade Operacional + view "CI's em INCs do AIOPS".
    CI_URL = os.getenv("CI_URL")

    # DESPROMOVIDOS_URL não vem do .env — é construída dinamicamente em
    # cache.py (_build_despromovidos_url) a partir do roster em
    # team_service.get_usuarios(), pra incluir automaticamente qualquer
    # operador novo sem precisar editar URL nenhuma à mão (pedido
    # explícito do utilizador).

    # --- Desativadas por agora: sem link novo da instância edpon ainda ---
    SLA3_GROUPS_URL = os.getenv("SLA3_GROUPS_URL")
    USERS_URL = os.getenv("USERS_URL")
    AUDITKEYS_URL = os.getenv("AUDITKEYS_URL")
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
    SN_FILENAME_INCS_CALLS_GCC = os.getenv("SN_FILENAME_INCS_CALLS_GCC", "INCS_CALLS_GCC_URL.xls")
    SN_FILENAME_USERS = os.getenv("SN_FILENAME_USERS", "users.xls")
    SN_FILENAME_AUDITKEYS = os.getenv("SN_FILENAME_AUDITKEYS", "auditkeys.xls")
    SN_FILENAME_DESPROMOVIDOS = os.getenv("SN_FILENAME_DESPROMOVIDOS", "Despromovidos_URL.xls")
    SN_FILENAME_CI = os.getenv("SN_FILENAME_CI", "CI_URL.xls")
    SN_FILENAME_BACKLOG_INC = os.getenv("SN_FILENAME_BACKLOG_INC", "mon_backlog_incs.xls")
    SN_FILENAME_BACKLOG_RITM = os.getenv("SN_FILENAME_BACKLOG_RITM", "mon_backlog_ritm.xls")
    # JUSTIFICACOES_URL é do SharePoint (.xlsm), não do ServiceNow — não dá
    # pra buscar automaticamente com as credenciais SN_USER/SN_PASS (ver
    # cache.py, SERVICENOW_URLS). Só é lido manualmente de downloads/.
    SN_FILENAME_JUSTIFICACOES = os.getenv("SN_FILENAME_JUSTIFICACOES", "JUSTIFICACOES_URL.xlsm")
    # Mesma situação de CALLS_URL — SharePoint (.xlsx), só manual.
    SN_FILENAME_CALLS = os.getenv("SN_FILENAME_CALLS", "CALLS_URL.xlsx")

    # --- Table REST API (reservado/futuro) ---
    _principal = os.getenv("PRINCIPAL_URL") or ""
    SN_INSTANCE_URL = _principal.split("/sys_report_template")[0] if _principal else None
    SN_INCIDENT_QUERY = os.getenv("SN_INCIDENT_QUERY", "ORDERBYDESCopened_at")
    SN_INCIDENT_LIMIT = int(os.getenv("SN_INCIDENT_LIMIT", "5000"))

    # --- Cache ---
    CACHE_REFRESH_MINUTES = int(os.getenv("CACHE_REFRESH_MINUTES", "20"))
    # Desliga o scheduler de busca automática ao ServiceNow (cache.py).
    # IMPORTANTE: se SN_USER for uma conta PESSOAL (não uma conta de
    # serviço dedicada), as tentativas periódicas de Basic Auth competem
    # com a tua própria sessão SSO no browser — confirmado causar logout
    # forçado (SAML Single Logout) do ServiceNow. Fica desligado por
    # default até haver uma conta de serviço; o dashboard continua a
    # funcionar via CSVs manuais em backend/downloads/.
    AUTO_FETCH_ENABLED = os.getenv("AUTO_FETCH_ENABLED", "false").lower() == "true"

    # --- CORS ---
    FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

    # --- Autenticação (Gestão de Turnos / Base de Dados — só admins) ---
    # A app não faz login nenhum sozinha: espera que um proxy à frente do
    # uvicorn (ex: IIS com Windows Authentication) já tenha autenticado o
    # utilizador e injete a identidade neste cabeçalho antes de
    # reencaminhar o pedido. IMPORTANTE: isto só é seguro se o uvicorn
    # NUNCA for alcançável a não ser através desse proxy — caso contrário
    # qualquer pessoa pode forjar este cabeçalho e fingir ser admin.
    AUTH_HEADER_NAME = os.getenv("AUTH_HEADER_NAME", "X-Remote-User")
    # ATENÇÃO: só para desenvolvimento local (sem proxy nenhum a correr).
    # NUNCA definir isto num deploy real — quem definir este valor no
    # .env do servidor consegue autenticar-se como esse username sem
    # precisar de mais nada.
    AUTH_DEV_BYPASS_USER = os.getenv("AUTH_DEV_BYPASS_USER") or None
    # Semente inicial da tabela app_admins (username,username,...) — só
    # aplicada uma vez, se a tabela ainda estiver vazia (mesmo padrão de
    # turnos_service.seed_if_empty).
    INITIAL_ADMIN_USERS = os.getenv("INITIAL_ADMIN_USERS", "")

    # --- URLs de export EXCEL pros Reports (Ibéria/Brasil, CAB, P1 Semanal) ---
    # Nunca buscadas pelo backend — só devolvidas ao frontend (ver
    # routers/reports_email.py, GET /api/reports/export-config) pra abrir
    # com window.open() na sessão de browser do utilizador.
    REPORTS_P1_SEMANAL_URL = os.getenv("REPORTS_P1_SEMANAL_URL")
    REPORTS_CAB_OUTAGE_URL = os.getenv("REPORTS_CAB_OUTAGE_URL")
    REPORTS_CAB_CHANGES_URL = os.getenv("REPORTS_CAB_CHANGES_URL")
    REPORTS_IB_P1_MATINAL_URL = os.getenv("REPORTS_IB_P1_MATINAL_URL")
    REPORTS_IB_INCS_DIARIO_URL = os.getenv("REPORTS_IB_INCS_DIARIO_URL")
    REPORTS_IB_BACKUPS_URL = os.getenv("REPORTS_IB_BACKUPS_URL")
    REPORTS_IB_BATCHS_URL = os.getenv("REPORTS_IB_BATCHS_URL")
    REPORTS_BR_P1_MATINAL_URL = os.getenv("REPORTS_BR_P1_MATINAL_URL")
    REPORTS_BR_INCS_DIARIO_URL = os.getenv("REPORTS_BR_INCS_DIARIO_URL")
    REPORTS_BR_BACKUPS_URL = os.getenv("REPORTS_BR_BACKUPS_URL")
    REPORTS_BR_BATCHS_URL = os.getenv("REPORTS_BR_BATCHS_URL")
    REPORTS_SPLUNKVAL_EDPON_URL = os.getenv("REPORTS_SPLUNKVAL_EDPON_URL")
    REPORTS_SPLUNKVAL_SPLUNK_URL = os.getenv("REPORTS_SPLUNKVAL_SPLUNK_URL")
    REPORTS_PS_INCSOPEN_URL = os.getenv("REPORTS_PS_INCSOPEN_URL")
    REPORTS_PS_USERSCMDB_URL = os.getenv("REPORTS_PS_USERSCMDB_URL")
    REPORTS_PS_EQUIPAS_URL = os.getenv("REPORTS_PS_EQUIPAS_URL")
    REPORTS_PS_APPS_URL = os.getenv("REPORTS_PS_APPS_URL")


settings = Settings()

_missing = [k for k in ("PRINCIPAL_URL", "SLA3_URL", "SLA4_URL") if not getattr(settings, k)]
if _missing:
    logger.warning(
        "Variáveis em falta no .env: %s. O backend usará CSVs manuais "
        "de downloads/ enquanto estas URLs não estiverem configuradas.",
        ", ".join(_missing),
    )
