# routers/analytics.py
"""
IMPORTANTE: removi os fallbacks silenciosos (try/except devolvendo
{"ok_count": 0, ...} como se fosse dado real) que existiam aqui antes.
Isso escondia falhas reais atrás de números que pareciam válidos — um
usuário veria "0 incidentes NOK" e acharia que está tudo bem, quando na
verdade o backend nem conseguiu calcular nada. Agora, se o dado não
estiver disponível, o endpoint devolve 503 com o motivo real (igual ao
resto da API), e o frontend já sabe tratar isError.

Migração 2026-08: quality/sem-evento/sla3-detailed/sla4-detailed agora
vêm do histórico gravado no SQLite (services/history_service.py), não do
CACHE em memória do fetch ao vivo. backlog/despromovidos continuam via
CACHE porque essas tabelas (mon_backlog_incs/ritm, despromovidos) ainda
não têm link novo configurado (ver .env) — não fazem parte do histórico
incremental ainda.
"""
from fastapi import APIRouter, HTTPException

from cache import CACHE
from services import history_service

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _get_from_db(key: str, month: str | None = None):
    try:
        summary = history_service.get_current_summary(month)
    except LookupError as exc:
        raise HTTPException(status_code=503, detail=f"Dado indisponível: {exc}") from exc
    return summary[key]


def _get_from_cache(key: str):
    value = CACHE.get(key)
    if value is None:
        error = CACHE.get("errors", {}).get(key, "cache ainda não populado")
        raise HTTPException(status_code=503, detail=f"Dado indisponível: {error}")
    return value


@router.get("/quality")
def quality_metrics(month: str | None = None):
    return _get_from_db("quality_metrics", month)


@router.get("/sem-evento")
def sem_evento_summary(month: str | None = None):
    return _get_from_db("sem_evento_summary", month)


@router.get("/sla3-detailed")
def sla3_detailed(month: str | None = None):
    return _get_from_db("sla_overview", month)["sla3"]


@router.get("/sla4-detailed")
def sla4_detailed(month: str | None = None):
    return _get_from_db("sla_overview", month)["sla4"]


@router.get("/backlog")
def backlog_summary():
    return _get_from_cache("backlog_summary")


@router.get("/despromovidos")
def despromovidos_summary():
    return _get_from_cache("despromovidos_summary")
