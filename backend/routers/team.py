# routers/team.py
"""View "Gestão de Equipa" (dentro de "Base de Dados") — CRUD do roster
unificado (team_members, ver services/team_service.py). Admin-only."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from services import auth_service, team_service

router = APIRouter(prefix="/team", tags=["team"], dependencies=[Depends(auth_service.require_admin)])


class MemberCreate(BaseModel):
    name: str
    username: str | None = None
    team: str | None = None
    is_admin: bool = False
    is_hidden: bool = False
    force_monitorizacao: bool = False


class MemberUpdate(BaseModel):
    name: str | None = None
    username: str | None = None
    team: str | None = None
    is_admin: bool | None = None
    is_hidden: bool | None = None
    force_monitorizacao: bool | None = None


@router.get("/members")
def list_members():
    return team_service.list_members()


@router.post("/members")
def add_member(payload: MemberCreate):
    if not payload.name.strip():
        raise HTTPException(status_code=422, detail="Nome não pode ser vazio.")
    try:
        return team_service.add_member(
            name=payload.name,
            username=payload.username,
            team=payload.team,
            is_admin=payload.is_admin,
            is_hidden=payload.is_hidden,
            force_monitorizacao=payload.force_monitorizacao,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/members/{member_id}")
def update_member(member_id: int, payload: MemberUpdate):
    try:
        team_service.update_member(member_id, **payload.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True}


@router.delete("/members/{member_id}")
def remove_member(member_id: int):
    try:
        team_service.remove_member(member_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True}
