# routers/operators.py
from fastapi import APIRouter

from routers.dashboard import _get_or_503

router = APIRouter(prefix="/operators", tags=["operators"])


@router.get("")
def operators_summary():
    return _get_or_503("operators_summary")
