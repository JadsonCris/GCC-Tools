# routers/incidents.py
from fastapi import APIRouter

from routers.dashboard import _get_or_503

router = APIRouter(prefix="/incidents", tags=["incidents"])


@router.get("")
def incidents_summary():
    return _get_or_503("incidents_summary")
