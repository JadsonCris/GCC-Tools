# routers/ponto_situacao.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from services import auth_service, ponto_situacao_service as svc

router = APIRouter(prefix="/ponto-situacao", tags=["ponto-situacao"])


@router.get("/status")
def status():
    try:
        resultado = {}
        for tabela in svc.TABELAS_VALIDAS:
            linhas, colunas = svc.obter_tabela(tabela)
            resultado[tabela] = {
                "linhas": len(linhas),
                "colunas": colunas,
                "atualizado_em": svc.obter_atualizacao(tabela),
            }
        return resultado
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Falha ao ler estado dos dados de referência: {exc}") from exc


@router.get("/grupos")
def grupos():
    try:
        return svc.grupos_distintos()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Falha ao ler lista de grupos: {exc}") from exc


@router.get("/aplicacoes")
def aplicacoes():
    try:
        return svc.aplicacoes_distintas()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Falha ao ler lista de aplicações: {exc}") from exc


class ImportarPayload(BaseModel):
    linhas: list[dict]
    modo: str = "substituir"


# RESOLVIDO (bug real, revisão de segurança 2026-09): estes dois
# endpoints fazem DROP/CREATE/INSERT em bruto nas tabelas de referência
# (ps_userscmdb/ps_equipas/ps_incsopen/ps_apps — ver ponto_situacao_
# service.importar_linhas_para_tabela/limpar_tabela) mas não tinham
# proteção NENHUMA, ao contrário do que services/auth_service.py
# documentava ("só turnos/db_admin/team têm escrita"). Só estes dois
# ficam admin-only — o resto do router (status/grupos/aplicações,
# gerar e-mail de ponto de situação) continua aberto a qualquer membro
# autenticado pelo proxy, igual ao resto da app (uso normal da operação
# do dia a dia, não uma ação administrativa).
@router.post("/tabelas/{tabela}/importar", dependencies=[Depends(auth_service.require_admin)])
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


@router.delete("/tabelas/{tabela}", dependencies=[Depends(auth_service.require_admin)])
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
    try:
        return svc.montar_pedido_equipa(payload.incidente.strip(), payload.equipa.strip())
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Falha ao montar pedido de equipa: {exc}") from exc


class PedidoTLPayload(BaseModel):
    incidente: str = ""
    aplicacao: str = ""


@router.post("/tl")
def pedido_tl(payload: PedidoTLPayload):
    try:
        return svc.montar_pedido_tl(payload.incidente.strip(), payload.aplicacao.strip())
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Falha ao montar pedido de TL: {exc}") from exc


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
