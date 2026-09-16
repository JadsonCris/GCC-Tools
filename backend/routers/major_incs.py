# routers/major_incs.py
from datetime import date

from fastapi import APIRouter, HTTPException

from services import history_service

router = APIRouter(prefix="/major-incs", tags=["major-incs"])


@router.get("")
def major_incs_summary(start: date, end: date, region: str | None = None):
    """
    P1s tratados vs despromovidos + Calls, no período/região
    selecionados — ver services/history_service.get_major_incs_summary.
    """
    try:
        return history_service.get_major_incs_summary(start.isoformat(), end.isoformat(), region=region)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Falha ao calcular Major Incs: {exc}") from exc
