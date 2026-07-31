# routers/sla.py
from fastapi import APIRouter

from routers.dashboard import _get_or_503

router = APIRouter(prefix="/sla", tags=["sla"])


@router.get("")
def sla_overview():
    return _get_or_503("sla_overview")
