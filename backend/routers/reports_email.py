# routers/reports_email.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import settings
from services import reports_email_service

router = APIRouter(prefix="/reports", tags=["reports"])


def _slot(label: str, url: str | None) -> dict:
    return {"label": label, "url": url}


@router.get("/export-config")
def export_config():
    """
    URLs de export EXCEL do ServiceNow pros botões "Descarregar" dos
    Reports (lidas de .env, ver config.py) — nunca buscadas pelo backend,
    só devolvidas ao frontend, que as abre com window.open() na sessão de
    browser já autenticada do utilizador. `url: null` quando a variável
    não está configurada no .env — o frontend esconde/desativa o botão
    nesse caso, em vez de abrir um link vazio.
    """
    return {
        "p1Semanal": _slot("P1s Semanal", settings.REPORTS_P1_SEMANAL_URL),
        "cab": {
            "outage": _slot("Outage Diária", settings.REPORTS_CAB_OUTAGE_URL),
            "changes": _slot("Changes Diários", settings.REPORTS_CAB_CHANGES_URL),
        },
        "regions": {
            "ib": {
                "p1Matinal": _slot("P1 Matinal", settings.REPORTS_IB_P1_MATINAL_URL),
                "incsDiario": _slot("INCs Diário", settings.REPORTS_IB_INCS_DIARIO_URL),
                "backups": _slot("Backups Ibéria", settings.REPORTS_IB_BACKUPS_URL),
                "batchs": _slot("Batchs Ibéria", settings.REPORTS_IB_BATCHS_URL),
            },
            "br": {
                "p1Matinal": _slot("P1 Matinal", settings.REPORTS_BR_P1_MATINAL_URL),
                "incsDiario": _slot("INCs Diário", settings.REPORTS_BR_INCS_DIARIO_URL),
                "backups": _slot("Backups Brasil", settings.REPORTS_BR_BACKUPS_URL),
                "batchs": _slot("Batchs Brasil", settings.REPORTS_BR_BATCHS_URL),
            },
        },
        "splunkValidacao": {
            "edpon": _slot("Ficheiro EdpOn", settings.REPORTS_SPLUNKVAL_EDPON_URL),
            "splunk": _slot("Ficheiro Splunk", settings.REPORTS_SPLUNKVAL_SPLUNK_URL),
        },
        "pontoSituacao": {
            "incsopen": _slot("Incidentes Abertos", settings.REPORTS_PS_INCSOPEN_URL),
            "userscmdb": _slot("Utilizadores", settings.REPORTS_PS_USERSCMDB_URL),
            "equipas": _slot("Membros de Equipas", settings.REPORTS_PS_EQUIPAS_URL),
            "apps": _slot("Aplicações (CMDB)", settings.REPORTS_PS_APPS_URL),
        },
    }


class P1SemanalPayload(BaseModel):
    linhas: list[dict]


class CabPayload(BaseModel):
    tipo: str
    texto_inicio: str
    texto_fim: str
    changes: list[dict]


class OutlookReportPayload(BaseModel):
    regiao: str
    tipo: str
    tabelas: dict[str, list[dict]]


@router.post("/p1-semanal/enviar")
def enviar_p1_semanal(payload: P1SemanalPayload):
    ok, message = reports_email_service.gerar_email_p1_semanal(payload.linhas)
    if not ok:
        raise HTTPException(status_code=500, detail=message)
    return {"ok": True, "message": message}


@router.post("/cab/enviar")
def enviar_cab(payload: CabPayload):
    ok, message = reports_email_service.gerar_email_cab(
        payload.tipo, payload.texto_inicio, payload.texto_fim, payload.changes
    )
    if not ok:
        raise HTTPException(status_code=500, detail=message)
    return {"ok": True, "message": message}


@router.post("/outlook/enviar")
def enviar_outlook(payload: OutlookReportPayload):
    ok, message = reports_email_service.gerar_email_outlook(payload.regiao, payload.tipo, payload.tabelas)
    if not ok:
        raise HTTPException(status_code=500, detail=message)
    return {"ok": True, "message": message}
