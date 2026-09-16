# routers/db_admin.py
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from cache import ingest_manual_upload, importable_tables_with_download_urls
from services import auth_service, db_admin_service
from services.servicenow_client import ServiceNowFetchError

# View "Base de Dados" — só admins (ver services/auth_service.py).
router = APIRouter(prefix="/db", tags=["db-admin"], dependencies=[Depends(auth_service.require_admin)])

# RESOLVIDO (revisão de segurança 2026-09): upload_table lia o ficheiro
# inteiro pra memória (`await file.read()`) sem limite nenhum de
# tamanho — mesmo sendo admin-only, um upload de vários GB podia esgotar
# a memória do processo. O maior export real desta app (CI's, ~17 mil
# linhas) fica bem abaixo de 10MB; 50MB dá folga generosa sem abrir a
# porta a um ficheiro arbitrariamente grande.
MAX_UPLOAD_BYTES = 50 * 1024 * 1024


@router.get("/tables")
def tables():
    """Lista de tabelas reais da dashboard.db + nº de linhas de cada uma."""
    return db_admin_service.list_tables()


@router.get("/tables/{table}")
def table_data(
    table: str, limit: int = 100, offset: int = 0,
    order_by: str | None = None, order_dir: str = "asc",
):
    """Conteúdo paginado (e opcionalmente ordenado no servidor, sobre a
    tabela inteira) de uma tabela — view "Base de Dados"."""
    limit = max(1, min(limit, 500))
    offset = max(0, offset)
    try:
        return db_admin_service.get_table_data(
            table, limit=limit, offset=offset, order_by=order_by, order_dir=order_dir
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/importable-tables")
def importable_tables():
    """Tabelas que a app sabe processar via upload manual, cada uma com
    o link de download direto do ServiceNow quando existir (ver
    cache.importable_tables_with_download_urls) — alimenta o seletor de
    tabela + botão de download do painel "Carregar Tabela Manualmente"
    em "Base de Dados"."""
    return {"tables": importable_tables_with_download_urls()}


@router.post("/tables/{table}/upload")
async def upload_table(table: str, request: Request, file: UploadFile = File(...)):
    """
    Upload manual de um ficheiro exportado (.xls/.xlsx/.xlsm/.csv) pra
    dentro da tabela indicada — grava DIRETO no SQLite (mesmo caminho do
    ciclo automático, ver cache.ingest_manual_upload), pra usar quando a
    busca automática ao ServiceNow falhar e não se quiser esperar pelo
    próximo ciclo do scheduler.
    """
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"Ficheiro demasiado grande (máx. {MAX_UPLOAD_BYTES // (1024 * 1024)}MB).")
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"Ficheiro demasiado grande (máx. {MAX_UPLOAD_BYTES // (1024 * 1024)}MB).")
    if not content:
        raise HTTPException(status_code=400, detail="Ficheiro vazio.")
    try:
        return ingest_manual_upload(table, file.filename or "upload", content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ServiceNowFetchError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Falha ao processar o ficheiro: {exc}") from exc
