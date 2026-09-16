# routers/turnos.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from services import auth_service, turnos_service

# View "Gestão de Turnos" — só admins (ver services/auth_service.py).
router = APIRouter(prefix="/turnos", tags=["turnos"], dependencies=[Depends(auth_service.require_admin)])


class EmployeeCreate(BaseModel):
    name: str
    pos: str = "MOD"


class EmployeeUpdate(BaseModel):
    name: str | None = None
    pos: str | None = None
    hidden: bool | None = None


class MonthShiftsPayload(BaseModel):
    year: int
    month: int  # 1-indexado (Janeiro=1)
    days: dict[str, str]  # {"1": "M", "2": "", ...}


class ClearMonthPayload(BaseModel):
    year: int
    month: int


@router.get("/employees")
def get_employees():
    return turnos_service.list_employees()


@router.post("/employees")
def post_employee(payload: EmployeeCreate):
    if not payload.name.strip():
        raise HTTPException(status_code=422, detail="Nome não pode ser vazio.")
    return turnos_service.create_employee(payload.name, payload.pos)


@router.patch("/employees/{employee_id}")
def patch_employee(employee_id: int, payload: EmployeeUpdate):
    try:
        turnos_service.update_employee(employee_id, name=payload.name, pos=payload.pos, hidden=payload.hidden)
        return {"ok": True}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Falha ao atualizar colaborador: {exc}") from exc


@router.delete("/employees/{employee_id}")
def delete_employee(employee_id: int):
    try:
        turnos_service.delete_employee(employee_id)
        return {"ok": True}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Falha ao remover colaborador: {exc}") from exc


@router.get("/shifts")
def get_shifts(year: int):
    """Turnos do ano inteiro, todos os colaboradores — {employee_id: {"YYYY-MM-DD": shift}}."""
    try:
        return turnos_service.get_shifts_for_year(year)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Falha ao ler turnos do ano: {exc}") from exc


@router.put("/employees/{employee_id}/shifts")
def put_month_shifts(employee_id: int, payload: MonthShiftsPayload):
    """Substitui os turnos desse colaborador nesse mês (botão "Guardar")."""
    invalid = [k for k, v in payload.days.items() if v and v not in turnos_service.VALID_SHIFTS]
    if invalid:
        raise HTTPException(status_code=422, detail=f"Turno(s) inválido(s): {invalid}")
    turnos_service.save_month_shifts(employee_id, payload.year, payload.month, payload.days)
    return {"ok": True}


@router.post("/clear-month")
def clear_month(payload: ClearMonthPayload):
    try:
        turnos_service.clear_month(payload.year, payload.month)
        return {"ok": True}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Falha ao limpar o mês: {exc}") from exc
