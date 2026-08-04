# routers/incidents.py
from fastapi import APIRouter, HTTPException

from services import history_service

router = APIRouter(prefix="/incidents", tags=["incidents"])


@router.get("")
def incidents_summary(month: str | None = None):
    try:
        summary = history_service.get_current_summary(month)
    except LookupError as exc:
        raise HTTPException(status_code=503, detail=f"Dado indisponível: {exc}") from exc
    return summary["incidents_summary"]
