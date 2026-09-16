# routers/auth.py
from fastapi import APIRouter, HTTPException, Request

from services import auth_service, team_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me")
def me(request: Request):
    """Identidade do pedido atual (ver auth_service.get_current_user) +
    se é admin — o frontend usa isto pra decidir o que mostrar na sidebar."""
    try:
        username = auth_service.get_current_user(request)
        return {"username": username, "is_admin": team_service.is_admin(username)}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Falha ao identificar utilizador: {exc}") from exc
