# services/browser_client.py
"""
Fallback via browser real (Playwright) para quando o download automático
via requests (servicenow_client.py) falha — normalmente por causa de
autenticação SSO/NTLM que o requests puro não sabe negociar.

Como a máquina já está sempre autenticada no domínio corporativo (Windows
Integrated Authentication), NÃO precisamos de fluxo de login manual nem
de sessão salva: o Edge/Chrome negocia o NTLM/Kerberos sozinho, desde que
o domínio do ServiceNow esteja na whitelist de auth abaixo.

Usa o canal 'msedge' (o Edge já instalado na máquina corporativa) em vez
de baixar um Chromium à parte — evita esbarrar em política de instalação
de binários não autorizados.

Isto só é acionado quando fetch_csv() (via requests) falha primeiro —
ver cache.py -> fetch_and_download_csvs().
"""
import logging
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

from config import settings

logger = logging.getLogger("browser_client")


class BrowserFetchError(Exception):
    pass


def fetch_csv_via_browser(url: str, table_name: str, download_dir: Path) -> Path:
    """
    Abre um browser real (headless por padrão), navega até a URL de
    export CSV do ServiceNow e captura o download disparado pela página.
    A sessão SSO corporativa é negociada automaticamente pelo próprio
    browser — sem prompt, sem cookie salvo, sem login manual.
    """
    if not url:
        raise BrowserFetchError(f"URL vazia para '{table_name}' — não há o que abrir no browser.")

    download_dir.mkdir(parents=True, exist_ok=True)
    dest_path = download_dir / f"{table_name}.csv"

    auth_whitelist = settings.SN_AUTH_DOMAINS  # ex: "*.tuaempresa.com"
    launch_args = []
    if auth_whitelist:
        launch_args += [
            f"--auth-server-whitelist={auth_whitelist}",
            f"--auth-negotiate-delegate-whitelist={auth_whitelist}",
        ]

    logger.info(
        "Abrindo browser (%s, headless=%s) para '%s'...",
        settings.BROWSER_CHANNEL, settings.PLAYWRIGHT_HEADLESS, table_name,
    )

    with sync_playwright() as p:
        browser = p.chromium.launch(
            channel=settings.BROWSER_CHANNEL,
            headless=settings.PLAYWRIGHT_HEADLESS,
            args=launch_args,
        )
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()

        try:
            with page.expect_download(timeout=settings.PLAYWRIGHT_DOWNLOAD_TIMEOUT_MS) as download_info:
                page.goto(url, timeout=settings.PLAYWRIGHT_DOWNLOAD_TIMEOUT_MS)
            download = download_info.value
            download.save_as(dest_path)
            logger.info("'%s' baixado via browser com sucesso -> %s", table_name, dest_path)
            return dest_path
        except PlaywrightTimeoutError as exc:
            content = page.content()
            if "login" in content.lower() or "sign in" in content.lower():
                raise BrowserFetchError(
                    f"'{table_name}': a página parece ser de login — o SSO "
                    "não foi negociado automaticamente. Confere SN_AUTH_DOMAINS "
                    "no .env e se o domínio está na Intranet Zone do Windows "
                    "(Painel de Controle > Opções da Internet > Segurança)."
                ) from exc
            raise BrowserFetchError(
                f"'{table_name}': nenhum download disparado em "
                f"{settings.PLAYWRIGHT_DOWNLOAD_TIMEOUT_MS}ms."
            ) from exc
        finally:
            context.close()
            browser.close()