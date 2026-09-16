# main.py
import logging

# Tem de ser o PRIMEIRO import: injeta o certificate store do próprio
# Windows no ssl do Python (em vez de só o bundle do certifi), antes de
# qualquer módulo criar sessões HTTP. Sem isto, requests.get() ao
# ServiceNow falhava com "self-signed certificate in certificate chain"
# nesta rede (há um proxy/firewall corporativo que faz TLS inspection —
# o Windows/browser já confia na CA dele via política de grupo, o
# certifi do Python não). Afeta tanto cache.py (busca automática do
# dashboard principal) quanto os novos endpoints de fetch dos Reports.
import truststore
truststore.inject_into_ssl()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from cache import start_scheduler
from config import settings
from routers import dashboard, sla, incidents, operators, analytics, turnos, major_incs, reports_email, ponto_situacao, db_admin, auth, team
from services import team_service
from services.turnos_service import seed_if_empty

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Claranet GCC Service Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard.router, prefix="/api")
app.include_router(sla.router, prefix="/api")
app.include_router(incidents.router, prefix="/api")
app.include_router(operators.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(turnos.router, prefix="/api")
app.include_router(major_incs.router, prefix="/api")
app.include_router(reports_email.router, prefix="/api")
app.include_router(ponto_situacao.router, prefix="/api")
app.include_router(db_admin.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(team.router, prefix="/api")


@app.on_event("startup")
def on_startup():
    if settings.AUTH_DEV_BYPASS_USER:
        logging.getLogger("auth").warning(
            "AUTH_DEV_BYPASS_USER está definido ('%s') — todos os pedidos sem o "
            "cabeçalho %s serão autenticados como este utilizador, SEM verificação "
            "nenhuma. Isto é só para desenvolvimento local; NUNCA arrancar assim "
            "num servidor real.",
            settings.AUTH_DEV_BYPASS_USER, settings.AUTH_HEADER_NAME,
        )
    seed_if_empty()
    team_service.seed_if_empty()
    start_scheduler()


@app.get("/api/health")
def health():
    return {"status": "ok"}
