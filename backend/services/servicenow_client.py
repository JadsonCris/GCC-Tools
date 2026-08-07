# services/servicenow_client.py
"""
Cliente HTTP robusto pra buscar os exports do ServiceNow. Usado pelo
cache.py em vez de requests.get() puro — as proteções abaixo foram
validadas ao longo de bastante troubleshooting real (não são teóricas):

1. trust_env=False: desliga autodetecção de proxy do SO (Windows WPAD),
   que causava travamentos de minutos sem erro nem timeout disparando.
2. Trava de segurança dura (ThreadPoolExecutor): garante que a busca
   desiste em no máximo timeout[0]+timeout[1]+10s, não importa o motivo
   do travamento (proxy, antivírus, etc).
3. Retry-on-202: o ServiceNow gera alguns relatórios pesados de forma
   assíncrona (devolve 202 "processando"). Em vez de falhar na hora,
   espera e tenta de novo (5,10,15,20,30s = ~90s de paciência total).
4. Migração 2026-08: as URLs trocaram de "?CSV&" pra "?EXCEL&" (instância
   edpon.service-now.com) — a resposta agora é um .xls binário (OLE2,
   assinatura \\xD0\\xCF\\x11\\xE0), não texto. `fetch_csv()` detecta o
   formato pela assinatura e usa `pd.read_excel` (via `xlrd`); se algum
   dia uma URL voltar a usar "?CSV&", ainda cai no parser de texto antigo.
"""
import csv
import logging
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from io import BytesIO, StringIO

import pandas as pd
import requests

from config import settings

_XLS_OLE2_MAGIC = b"\xd0\xcf\x11\xe0"
_HTML_MARKERS = (b"<!doctype", b"<html")

logger = logging.getLogger("servicenow_client")

_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="sn-fetch")

REPORT_RETRY_DELAYS = [5, 10, 15, 20, 30]

_session = requests.Session()
if settings.SN_USER and settings.SN_PASS:
    _session.auth = (settings.SN_USER, settings.SN_PASS)
_session.trust_env = False  # essencial no Windows corporativo — ver docstring acima


class ServiceNowFetchError(Exception):
    pass


def _get_with_failsafe(url: str, *, params: dict | None = None, timeout: tuple[int, int] = (10, 20)):
    hard_timeout = timeout[0] + timeout[1] + 10
    future = _executor.submit(_session.get, url, params=params, timeout=timeout)
    try:
        return future.result(timeout=hard_timeout)
    except FutureTimeoutError as exc:
        raise ServiceNowFetchError(
            f"A busca de {url} travou por mais de {hard_timeout}s sem "
            "resposta nem erro do próprio requests — isso costuma indicar "
            "autodetecção de proxy/WPAD travando no Windows, ou algum "
            "antivírus/firewall interceptando o tráfego HTTPS."
        ) from exc
    except requests.exceptions.ConnectTimeout as exc:
        raise ServiceNowFetchError(
            f"Timeout ao CONECTAR em {url} (>{timeout[0]}s). Confere a VPN. "
            "Detalhe: " + str(exc)
        ) from exc
    except requests.exceptions.ReadTimeout as exc:
        raise ServiceNowFetchError(
            f"Conectou em {url}, mas não respondeu em {timeout[1]}s. "
            "Detalhe: " + str(exc)
        ) from exc
    except requests.exceptions.ConnectionError as exc:
        raise ServiceNowFetchError(
            f"Não foi possível conectar em {url}. Detalhe: " + str(exc)
        ) from exc


def fetch_csv(url: str, *, timeout: tuple[int, int] = (10, 60)) -> pd.DataFrame:
    """
    Busca uma URL de export do ServiceNow (EXCEL ou, por compatibilidade,
    CSV) e devolve um DataFrame já com cabeçalhos limpos. Read timeout
    generoso (60s) porque esses relatórios podem demorar pra responder
    mesmo antes de darem 202.
    """
    if not url:
        raise ServiceNowFetchError("URL vazia/ não configurada no .env")

    logger.info("Buscando %s ...", url)
    resp = _get_with_failsafe(url, timeout=timeout)
    logger.info("Resposta de %s: status=%s", url, resp.status_code)

    attempt = 0
    while resp.status_code == 202 and attempt < len(REPORT_RETRY_DELAYS):
        delay = REPORT_RETRY_DELAYS[attempt]
        logger.info(
            "%s devolveu 202 (relatório sendo gerado) — aguardando %ds "
            "antes de tentar de novo (tentativa %d/%d)...",
            url, delay, attempt + 1, len(REPORT_RETRY_DELAYS),
        )
        time.sleep(delay)
        resp = _get_with_failsafe(url, timeout=timeout)
        logger.info("Resposta de %s: status=%s", url, resp.status_code)
        attempt += 1

    if resp.status_code == 202:
        total_wait = sum(REPORT_RETRY_DELAYS)
        raise ServiceNowFetchError(
            f"{url} continuou devolvendo 202 mesmo após esperar ~{total_wait}s "
            "no total — o relatório pode ser grande demais pra gerar nesse "
            "tempo, ou a conta de serviço pode não ter permissão real."
        )
    if resp.status_code == 401:
        raise ServiceNowFetchError(f"401 Unauthorized em {url} — confere SN_USER/SN_PASS no .env.")
    resp.raise_for_status()

    content = resp.content
    logger.info(
        "Resposta de %s: %d bytes, Content-Type=%s, primeiros bytes=%r",
        url, len(content), resp.headers.get("Content-Type", ""), content[:16],
    )

    if not content.strip():
        raise ServiceNowFetchError(
            f"A resposta de {url} veio vazia. O relatório pode não ter "
            "linhas no período atual, ou a query pode estar errada."
        )

    if _looks_like_html_login(content):
        raise ServiceNowFetchError(
            f"A resposta de {url} veio como HTML (provavelmente página de "
            "login). Verifica SN_USER/SN_PASS no .env ou se a instância "
            "exige SSO em vez de Basic Auth."
        )

    df = _parse_response_bytes(content, url)
    df.columns = [str(c).strip() for c in df.columns]
    return df


def _looks_like_html_login(content: bytes) -> bool:
    sniff = content[:1024].strip().lower()
    return sniff.startswith(_HTML_MARKERS) or b"<html" in sniff


def _parse_response_bytes(content: bytes, url: str) -> pd.DataFrame:
    """
    A instância nova exporta em EXCEL (.xls binário legado, assinatura
    OLE2). Se uma URL ainda usar "?CSV&", a resposta vem como texto —
    tentamos decodificar e cair no parser de CSV antigo nesse caso.
    """
    if content[:4] == _XLS_OLE2_MAGIC:
        try:
            return pd.read_excel(BytesIO(content), engine="xlrd")
        except Exception as exc:  # noqa: BLE001
            raise ServiceNowFetchError(f"Não consegui ler o Excel (.xls) de {url}: {exc}") from exc

    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ServiceNowFetchError(
            f"A resposta de {url} não é um .xls reconhecido (assinatura "
            "OLE2) nem texto decodificável como CSV. Se a instância passou "
            "a exportar .xlsx, é preciso instalar 'openpyxl' e ajustar "
            "este parser."
        ) from exc

    return _parse_csv_text(text, url)


def _parse_csv_text(text: str, url: str) -> pd.DataFrame:
    try:
        return pd.read_csv(StringIO(text), sep=None, engine="python")
    except (pd.errors.ParserError, pd.errors.EmptyDataError, csv.Error):
        pass

    for candidate_sep in (",", ";", "\t"):
        try:
            df = pd.read_csv(StringIO(text), sep=candidate_sep, engine="python")
            if df.shape[1] > 1:
                logger.info("Delimitador '%s' funcionou para %s", candidate_sep, url)
                return df
        except (pd.errors.ParserError, pd.errors.EmptyDataError, csv.Error):
            continue

    raise ServiceNowFetchError(
        f"Não consegui identificar o delimitador do CSV de {url}. "
        f"Primeiros 400 caracteres da resposta: {text[:400]!r}"
    )
