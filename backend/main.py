# main.py
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from cache import start_scheduler
from config import settings
from routers import dashboard, sla, incidents, operators, analytics, turnos, major_incs
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


@app.on_event("startup")
def on_startup():
    seed_if_empty()
    start_scheduler()


@app.get("/api/health")
def health():
    return {"status": "ok"}
