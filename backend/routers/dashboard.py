from datetime import date

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
def monthly_summary(month: str | None = None, region: str | None = None, hidden: str | None = None):
    """
    Resumo completo (KPIs, SLA1-4, operadores, prioridade, ferramentas,
    sem evento) filtrado por mês, lido do histórico acumulado no SQLite.
    Se `month` não for passado, usa o mês mais recente disponível.
    `region`: filtro de geografia opcional ("Global"/"Ibéria"/"Brasil").
    `hidden`: nomes de operador (separados por vírgula) a excluir da
    Atividade Operacional — filtro de operadores de Central Operacional.
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
        return history_service.get_monthly_summary(target_month, region=region, hidden=hidden)
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
def range_summary(start: date, end: date, region: str | None = None, hidden: str | None = None):
    """
    Resumo completo (igual ao /monthly) filtrado por um intervalo livre
    de datas 'YYYY-MM-DD' (um dia, várias semanas, vários meses, um ano
    — o que o filtro do frontend pedir), lido do histórico acumulado no
    SQLite. `region`: filtro de geografia opcional ("Global"/"Ibéria"/
    "Brasil"), igual ao que existia no dashboard antigo. `hidden`: nomes
    de operador (separados por vírgula) a excluir da Atividade Operacional.

    RESOLVIDO (revisão de segurança 2026-09): `start`/`end` eram `str`
    livres — uma data malformada só rebentava lá dentro em
    `pd.Timestamp()`, dando 500 com stack trace em vez de um 422 limpo.
    Usando o tipo `date` do FastAPI/Pydantic, a validação e a mensagem
    de erro ficam automáticas, antes de tocar em qualquer lógica.
    """
    try:
        return history_service.get_range_summary(start.isoformat(), end.isoformat(), region=region, hidden=hidden)
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=f"Dado indisponível: {exc}") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Falha ao calcular resumo do intervalo: {exc}") from exc


@router.get("/sla-trend")
def sla_trend(start: date, end: date, region: str | None = None):
    """
    SLA1-4 mês a mês, cobrindo só o intervalo [start,end] escolhido no
    filtro de datas (RESOLVIDO 2026-08: antes mostrava sempre o
    histórico completo, ignorando o filtro) — detalhe extra do Report
    SLAs. `region`: filtro de geografia opcional, igual aos demais
    endpoints.
    """
    try:
        return {"months": history_service.get_sla_trend(start.isoformat(), end.isoformat(), region=region)}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Falha ao calcular tendência: {exc}") from exc


@router.get("/aioper-trend")
def aioper_trend(start: date, end: date, region: str | None = None):
    """
    SLA1/SLA2/Prioridade mês a mês, só para incidentes abertos pelo
    AIOPER — mesmos painéis do Report SLAs, aplicados só ao bot. Usado
    pela view AIOPER.
    """
    try:
        return {"months": history_service.get_aioper_trend(start.isoformat(), end.isoformat(), region=region)}
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=f"Dado indisponível: {exc}") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Falha ao calcular tendência do AIOPER: {exc}") from exc


@router.get("/incidents-by-status")
def incidents_by_status(status: str, start: date, end: date, region: str | None = None):
    """
    Lista de incidentes por trás de cada card SLA Cumprido ("ok") /
    Falhado ("nok") / Justificado ("justificados") do Report SLAs — usado
    quando o utilizador clica num desses cards.
    """
    if status not in ("ok", "nok", "justificados"):
        raise HTTPException(status_code=422, detail="status inválido: use 'ok', 'nok' ou 'justificados'.")
    try:
        return {"incidents": history_service.get_incidents_by_status(start.isoformat(), end.isoformat(), status, region=region)}
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=f"Dado indisponível: {exc}") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Falha ao calcular incidentes por status: {exc}") from exc


@router.get("/incidents-list")
def incidents_list(start: date, end: date, region: str | None = None):
    """
    Lista de TODOS os incidentes do período ("Lista de Incidentes") —
    número, abertura, descrição, quem abriu, quem resolveu, nº de CI's e
    timestamp do CI mais recente. O frontend filtra/ordena/exporta
    localmente (mesmo padrão de /dashboard/incidents-by-status).
    """
    try:
        return {"incidents": history_service.get_incidents_list(start.isoformat(), end.isoformat(), region=region)}
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=f"Dado indisponível: {exc}") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Falha ao calcular lista de incidentes: {exc}") from exc


@router.get("/timeline")
def operational_timeline(year: int, month: int, region: str | None = None, hidden: str | None = None):
    """
    Sessões de trabalho detetadas por operador no mês indicado — Timeline
    e Equilíbrio de Turnos de Central Operacional (seletor de mês próprio,
    independente do filtro de período global da página). `hidden`: nomes
    de operador (separados por vírgula) a excluir.
    """
    try:
        return {"sessions": history_service.get_operational_timeline(year, month, region=region, hidden=hidden)}
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=f"Dado indisponível: {exc}") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Falha ao calcular timeline: {exc}") from exc
