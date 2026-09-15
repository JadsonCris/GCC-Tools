# routers/ponto_situacao.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services import ponto_situacao_service as svc

router = APIRouter(prefix="/ponto-situacao", tags=["ponto-situacao"])


@router.get("/status")
def status():
    resultado = {}
    for tabela in svc.TABELAS_VALIDAS:
        linhas, colunas = svc.obter_tabela(tabela)
        resultado[tabela] = {
            "linhas": len(linhas),
            "colunas": colunas,
            "atualizado_em": svc.obter_atualizacao(tabela),
        }
    return resultado


@router.get("/grupos")
def grupos():
    return svc.grupos_distintos()


@router.get("/aplicacoes")
def aplicacoes():
    return svc.aplicacoes_distintas()


class ImportarPayload(BaseModel):
    linhas: list[dict]
    modo: str = "substituir"


@router.post("/tabelas/{tabela}/importar")
def importar(tabela: str, payload: ImportarPayload):
    if tabela not in svc.TABELAS_VALIDAS:
        raise HTTPException(status_code=400, detail="Tabela inválida.")
    if not payload.linhas:
        raise HTTPException(status_code=400, detail="Nenhuma linha de dados recebida do ficheiro.")
    try:
        info = svc.importar_linhas_para_tabela(tabela, payload.linhas, payload.modo)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, "message": f"{info['linhas']} linhas guardadas na base de dados.", **info}


@router.delete("/tabelas/{tabela}")
def limpar(tabela: str):
    if tabela not in svc.TABELAS_VALIDAS:
        raise HTTPException(status_code=400, detail="Tabela inválida.")
    svc.limpar_tabela(tabela)
    return {"ok": True, "message": "Dados apagados."}


class PedidoEquipaPayload(BaseModel):
    incidente: str = ""
    equipa: str = ""


@router.post("/equipa")
def pedido_equipa(payload: PedidoEquipaPayload):
    return svc.montar_pedido_equipa(payload.incidente.strip(), payload.equipa.strip())


class PedidoTLPayload(BaseModel):
    incidente: str = ""
    aplicacao: str = ""


@router.post("/tl")
def pedido_tl(payload: PedidoTLPayload):
    return svc.montar_pedido_tl(payload.incidente.strip(), payload.aplicacao.strip())


class EnviarPayload(BaseModel):
    to: str
    subject: str = ""
    body: str = ""
    cc: str | None = None


@router.post("/enviar")
def enviar(payload: EnviarPayload):
    ok, message = svc.gerar_email_ponto_situacao(payload.to, payload.subject, payload.body, payload.cc)
    if not ok:
        raise HTTPException(status_code=500, detail=message)
    return {"ok": True, "message": message}
