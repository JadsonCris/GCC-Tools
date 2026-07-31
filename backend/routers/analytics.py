# routers/analytics.py
"""
IMPORTANTE: removi os fallbacks silenciosos (try/except devolvendo
{"ok_count": 0, ...} como se fosse dado real) que existiam aqui antes.
Isso escondia falhas reais atrás de números que pareciam válidos — um
usuário veria "0 incidentes NOK" e acharia que está tudo bem, quando na
verdade o backend nem conseguiu calcular nada. Agora, se o dado não
estiver disponível, o endpoint devolve 503 com o motivo real (igual ao
resto da API), e o frontend já sabe tratar isError.
"""
from fastapi import APIRouter
from routers.dashboard import _get_or_503

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/quality")
def quality_metrics():
    return _get_or_503("quality_metrics")


@router.get("/backlog")
def backlog_summary():
    return _get_or_503("backlog_summary")


@router.get("/sla3-detailed")
def sla3_detailed():
    return _get_or_503("sla3_detailed")


@router.get("/sla4-detailed")
def sla4_detailed():
    return _get_or_503("sla4_detailed")


@router.get("/despromovidos")
def despromovidos_summary():
    return _get_or_503("despromovidos_summary")
