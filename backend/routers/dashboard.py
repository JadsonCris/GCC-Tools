from fastapi import APIRouter, HTTPException
from cache import CACHE

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _get_or_503(key: str):
    value = CACHE.get(key)
    if value is None:
        error = CACHE.get("errors", {}).get(key, "cache ainda não populado")
        raise HTTPException(status_code=503, detail=f"Dado indisponível: {error}")
    return value


@router.get("/kpis")
def kpis():
    return _get_or_503("kpis")


@router.get("/priority")
def priority_breakdown():
    return _get_or_503("priority_breakdown")


@router.get("/tools")
def tools_breakdown():
    return _get_or_503("tools_breakdown")


@router.get("/status")
def cache_status():
    return {"last_updated": CACHE.get("last_updated"), "errors": CACHE.get("errors", {})}
