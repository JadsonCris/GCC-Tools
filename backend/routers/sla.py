# routers/sla.py
from fastapi import APIRouter, HTTPException

from services import history_service

router = APIRouter(prefix="/sla", tags=["sla"])


@router.get("")
def sla_overview(month: str | None = None):
    try:
        summary = history_service.get_current_summary(month)
    except LookupError as exc:
        raise HTTPException(status_code=503, detail=f"Dado indisponível: {exc}") from exc
    return summary["sla_overview"]
