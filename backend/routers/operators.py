# routers/operators.py
from datetime import date

from fastapi import APIRouter, HTTPException

from services import history_service
from services.operators_service import get_operator_detail

router = APIRouter(prefix="/operators", tags=["operators"])


@router.get("")
def operators_summary(month: str | None = None):
    try:
        summary = history_service.get_current_summary(month)
    except LookupError as exc:
        raise HTTPException(status_code=503, detail=f"Dado indisponível: {exc}") from exc
    return summary["operators_summary"]


@router.get("/{tecnico}")
def operator_detail(
    tecnico: str,
    month: str | None = None,
    start: date | None = None,
    end: date | None = None,
    region: str | None = None,
):
    try:
        if start and end:
            df = history_service.get_enriched_gcc_abertos_range(start.isoformat(), end.isoformat(), region=region)
        else:
            df = history_service.get_enriched_gcc_abertos(month, region=region)
    except LookupError as exc:
        raise HTTPException(status_code=503, detail=f"Dado indisponível: {exc}") from exc

    detail = get_operator_detail(df, tecnico)
    if detail is None:
        raise HTTPException(
            status_code=404,
            detail=f"Nenhum incidente encontrado para o técnico '{tecnico}'",
        )
    return detail
