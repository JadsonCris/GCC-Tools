# services/auth_service.py
"""
Identidade do pedido atual + controlo de acesso (admin vs operador) —
protege as views "Gestão de Turnos" e "Base de Dados" (routers/turnos.py,
routers/db_admin.py, routers/team.py, admin-only por completo) + os
endpoints de importar/limpar tabelas de referência em routers/
ponto_situacao.py (só esses dois, o resto desse router é uso normal da
operação). RESOLVIDO (revisão de segurança 2026-09): esta nota dizia
"únicas partes da app com escrita" — estava desatualizada, os dois
endpoints de ponto_situacao.py também escrevem em bruto na BD (DROP/
CREATE/INSERT) e não tinham proteção nenhuma até essa revisão. Quem é
ou não admin vive em services/team_service.py (tabela team_members,
unificada com o resto do roster da equipa) — este ficheiro só resolve
"quem está a fazer este pedido".

A app NÃO faz autenticação nenhuma sozinha. Espera correr atrás de um
proxy (ex: IIS com Windows Authentication/Kerberos-NTLM — o mesmo
mecanismo que services/browser_client.py já usa pra negociar sessão
automática com o ServiceNow) que autentica o utilizador e injeta a
identidade num cabeçalho HTTP antes de reencaminhar o pedido pro uvicorn
(ver config.AUTH_HEADER_NAME). A segurança real depende inteiramente de
o uvicorn nunca ser alcançável a não ser através desse proxy — se a
porta ficar exposta diretamente, qualquer cliente pode forjar o
cabeçalho e fingir ser quem quiser. Isso é configuração de
infraestrutura (fora do que este ficheiro consegue garantir sozinho).

Pra desenvolvimento local sem proxy nenhum, config.AUTH_DEV_BYPASS_USER
substitui o cabeçalho em falta — NUNCA definir isso num deploy real.
"""
from fastapi import HTTPException, Request

from config import settings
from services import team_service


def normalize_username(raw: str) -> str:
    """
    "DOMAIN\\ex134172" ou "ex134172@empresa.com" -> "EX134172" — mesmo
    formato (maiúsculas, sem domínio) já usado em team_service.
    """
    value = str(raw or "").strip()
    if "\\" in value:
        value = value.rsplit("\\", 1)[-1]
    if "@" in value:
        value = value.split("@", 1)[0]
    return value.upper()


def get_current_user(request: Request) -> str | None:
    """
    Identidade do pedido atual: cabeçalho confiado (injetado pelo proxy
    autenticador) ou, em desenvolvimento local, AUTH_DEV_BYPASS_USER.
    Devolve None se não houver identidade nenhuma disponível.
    """
    raw = request.headers.get(settings.AUTH_HEADER_NAME) or settings.AUTH_DEV_BYPASS_USER
    return normalize_username(raw) if raw else None


def require_admin(request: Request) -> str:
    """
    Dependency do FastAPI — protege routers inteiros (ver
    routers/turnos.py, routers/db_admin.py, routers/team.py):
    `APIRouter(..., dependencies=[Depends(require_admin)])`. 401 sem
    identidade nenhuma, 403 identificado mas não admin.
    """
    username = get_current_user(request)
    if not username:
        raise HTTPException(status_code=401, detail="Não autenticado.")
    if not team_service.is_admin(username):
        raise HTTPException(status_code=403, detail=f"Utilizador '{username}' não tem permissão de administrador.")
    return username
