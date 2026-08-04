from fastapi import APIRouter, HTTPException
from cache import CACHE
from services import history_service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _get_from_db(key: str, month: str | None = None):
    """
    Lê `key` do resumo calculado a partir do histórico gravado no SQLite
    (ver services/history_service.py) — NÃO do CACHE em memória alimentado
    pelo fetch ao vivo. Migração 2026-08: o fetch ao vivo ao ServiceNow
    só alimenta a BD agora; todo dado servido pela API vem daqui.
    """
    try:
        summary = history_service.get_current_summary(month)
    except LookupError as exc:
        raise HTTPException(status_code=503, detail=f"Dado indisponível: {exc}") from exc
    if key not in summary:
        raise HTTPException(status_code=503, detail=f"Dado indisponível: '{key}' não calculado neste resumo.")
    return summary[key]


@router.get("/kpis")
def kpis(month: str | None = None):
    return _get_from_db("kpis", month)


@router.get("/priority")
def priority_breakdown(month: str | None = None):
    return _get_from_db("priority_breakdown", month)


@router.get("/tools")
def tools_breakdown(month: str | None = None):
    return _get_from_db("tools_breakdown", month)


@router.get("/aioper")
def aioper_summary(month: str | None = None):
    return _get_from_db("aioper_summary", month)


@router.get("/status")
def cache_status():
    """
    Estado do CICLO DE FETCH (ao vivo, ao ServiceNow) — diferente dos
    demais endpoints deste router, que servem dado do histórico na BD.
    Isto aqui é só diagnóstico de saúde do job que alimenta a BD.
    """
    return {"last_updated": CACHE.get("last_updated"), "errors": CACHE.get("errors", {})}


@router.get("/months")
def available_months():
    """Meses (YYYY-MM) com dado histórico real na BD (active + backlog)."""
    return {"months": history_service.get_available_months()}


@router.get("/monthly")
def monthly_summary(month: str | None = None, region: str | None = None):
    """
    Resumo completo (KPIs, SLA1-4, operadores, prioridade, ferramentas,
    sem evento) filtrado por mês, lido do histórico acumulado no SQLite.
    Se `month` não for passado, usa o mês mais recente disponível.
    `region`: filtro de geografia opcional ("Global"/"Ibéria"/"Brasil").
    """
    months = history_service.get_available_months()
    if not months:
        raise HTTPException(status_code=503, detail="Dado indisponível: ainda sem histórico gravado na BD.")

    target_month = month or months[0]
    if target_month not in months:
        raise HTTPException(
            status_code=404,
            detail=f"Sem dado para o mês '{target_month}'. Meses disponíveis: {', '.join(months)}",
        )

    try:
        return history_service.get_monthly_summary(target_month, region=region)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Falha ao calcular resumo mensal: {exc}") from exc


@router.get("/bounds")
def date_bounds():
    """
    Data mais antiga e mais recente com incidentes reais na BD — usado
    pelo slider de intervalo do frontend pra saber os limites do eixo.
    """
    bounds = history_service.get_date_bounds()
    if bounds is None:
        raise HTTPException(status_code=503, detail="Dado indisponível: ainda sem histórico gravado na BD.")
    start, end = bounds
    return {"min_date": start, "max_date": end}


@router.get("/range")
def range_summary(start: str, end: str, region: str | None = None):
    """
    Resumo completo (igual ao /monthly) filtrado por um intervalo livre
    de datas 'YYYY-MM-DD' (um dia, várias semanas, vários meses, um ano
    — o que o filtro do frontend pedir), lido do histórico acumulado no
    SQLite. `region`: filtro de geografia opcional ("Global"/"Ibéria"/
    "Brasil"), igual ao que existia no dashboard antigo.
    """
    try:
        return history_service.get_range_summary(start, end, region=region)
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=f"Dado indisponível: {exc}") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Falha ao calcular resumo do intervalo: {exc}") from exc


@router.get("/sla-trend")
def sla_trend(region: str | None = None):
    """
    SLA1-4 mês a mês (histórico completo, independente do filtro de
    datas selecionado) — detalhe extra do Report SLAs. `region`: filtro
    de geografia opcional, igual aos demais endpoints.
    """
    return {"months": history_service.get_sla_trend(region=region)}


@router.get("/incidents-by-status")
def incidents_by_status(status: str, start: str, end: str, region: str | None = None):
    """
    Lista de incidentes por trás de cada card SLA Cumprido ("ok") /
    Falhado ("nok") / Justificado ("justificados") do Report SLAs — usado
    quando o utilizador clica num desses cards.
    """
    if status not in ("ok", "nok", "justificados"):
        raise HTTPException(status_code=422, detail="status inválido: use 'ok', 'nok' ou 'justificados'.")
    try:
        return {"incidents": history_service.get_incidents_by_status(start, end, status, region=region)}
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=f"Dado indisponível: {exc}") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Falha ao calcular incidentes por status: {exc}") from exc
