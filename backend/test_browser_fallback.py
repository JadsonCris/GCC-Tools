"""
test_browser_fallback.py
 
Script standalone pra validar o fallback via browser real (Playwright)
ANTES de mexer no backend. Não depende do FastAPI, do cache.py nem do
resto do projeto — só do .env (pra pegar as URLs e as configs de auth).
 
Como usar:
    1. Coloca este arquivo na pasta backend/ (mesmo nível do .env)
    2. pip install playwright   (não precisa rodar "playwright install")
    3. python test_browser_fallback.py
       -> baixa só o PRINCIPAL_URL, pra um teste rápido
    4. python test_browser_fallback.py --all
       -> tenta baixar TODAS as URLs configuradas no .env
 
O que ele faz, passo a passo, com log de cada etapa:
    1. Lê as URLs e configs (BROWSER_CHANNEL, SN_AUTH_DOMAINS, etc) do .env
    2. Abre o browser (headless por padrão, mas você pode forçar visível
       com --headed pra ENXERGAR o que está acontecendo na tela)
    3. Navega até a URL de export
    4. Espera o download disparar
    5. Salva o CSV em ./downloads_test/{nome}.csv
    6. Mostra as primeiras linhas do CSV pra confirmar que veio dado de
       verdade (não uma página de login/HTML por engano)
 
Se falhar, a mensagem de erro já aponta a causa mais provável (login
não negociado automaticamente, domínio fora da whitelist, etc) — igual
ao padrão de erros do resto do projeto.
"""
import argparse
import logging
import os
import sys
from pathlib import Path
 
from dotenv import load_dotenv
 
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("test_browser_fallback")
 
BASE_DIR = Path(__file__).resolve().parent
DOTENV_PATH = BASE_DIR / ".env"
DOWNLOAD_DIR = BASE_DIR / "downloads_test"
 
if not DOTENV_PATH.exists():
    logger.error(
        "Não encontrei .env em %s. Roda este script de dentro da pasta "
        "backend/ (mesmo lugar do teu .env real).", DOTENV_PATH,
    )
    sys.exit(1)
 
load_dotenv(dotenv_path=DOTENV_PATH, override=True)
 
# Mesmas URLs que o cache.py usa — mapeadas aqui direto pra não depender
# de nenhum módulo do projeto.
REPORTS = {
    "sys_report_template": os.getenv("PRINCIPAL_URL"),
    "sla3_incidentes": os.getenv("SLA3_URL"),
    "sla4": os.getenv("SLA4_URL"),
    "sla3_grupos": os.getenv("SLA3_GROUPS_URL"),
    "ok_": os.getenv("OK_URL"),
    "users": os.getenv("USERS_URL"),
    "auditkeys": os.getenv("AUDITKEYS_URL"),
    "despromovidos": os.getenv("DESPROMOVIDOS_URL"),
    "mon_backlog_incs": os.getenv("BACKLOG_INC_URL"),
    "mon_backlog_ritm": os.getenv("BACKLOG_RITM_URL"),
}
 
BROWSER_CHANNEL = os.getenv("BROWSER_CHANNEL", "msedge")
SN_AUTH_DOMAINS = os.getenv("SN_AUTH_DOMAINS", "")
DOWNLOAD_TIMEOUT_MS = int(os.getenv("PLAYWRIGHT_DOWNLOAD_TIMEOUT_MS", "60000"))
SN_USER = os.getenv("SN_USER", "")
SN_PASS = os.getenv("SN_PASS", "")
 
 
def try_download(page, table_name: str, url: str, headless: bool) -> Path | None:
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
 
    logger.info("--- Testando '%s' ---", table_name)
    logger.info("URL: %s", url)
 
    try:
        with page.expect_download(timeout=DOWNLOAD_TIMEOUT_MS) as download_info:
            page.goto(url, timeout=DOWNLOAD_TIMEOUT_MS)
        download = download_info.value
        dest = DOWNLOAD_DIR / f"{table_name}.csv"
        download.save_as(dest)
        logger.info("✅ '%s' baixado com sucesso -> %s", table_name, dest)
        return dest
    except PlaywrightTimeoutError:
        content = page.content().lower()
        if "login" in content or "sign in" in content or "user name" in content:
            logger.error(
                "❌ '%s': página parece ser de LOGIN — a autenticação não "
                "passou. Confere se SN_USER/SN_PASS no .env estão corretos "
                "e se essa conta de serviço tem permissão pra rodar/ver "
                "este relatório específico no ServiceNow.",
                table_name,
            )
        else:
            snippet = page.content()[:300].replace("\n", " ")
            logger.error(
                "❌ '%s': nenhum download disparado em %dms. "
                "Título da página: %r | Trecho do HTML: %r",
                table_name, DOWNLOAD_TIMEOUT_MS, page.title(), snippet,
            )
        return None
    except Exception as exc:  # noqa: BLE001
        logger.exception("❌ '%s': erro inesperado: %s", table_name, exc)
        return None
 
 
def preview_csv(path: Path):
    try:
        with path.open("r", encoding="utf-8-sig", errors="replace") as f:
            lines = [next(f) for _ in range(5)]
        logger.info("Primeiras linhas de %s:", path.name)
        for line in lines:
            print(f"    {line.rstrip()}")
    except StopIteration:
        pass
    except Exception as exc:  # noqa: BLE001
        logger.warning("Não consegui ler preview de %s: %s", path, exc)
 
 
def main():
    parser = argparse.ArgumentParser(description="Testa o fallback via browser (Playwright) isoladamente.")
    parser.add_argument("--all", action="store_true", help="Testa todas as URLs do .env (padrão: só a principal).")
    parser.add_argument("--headed", action="store_true", help="Abre o browser visível (padrão: headless).")
    args = parser.parse_args()
 
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        logger.error("Playwright não instalado. Roda: pip install playwright")
        sys.exit(1)
 
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
 
    targets = REPORTS.items() if args.all else [("sys_report_template", REPORTS["sys_report_template"])]
    targets = [(name, url) for name, url in targets if url]
 
    if not targets:
        logger.error("Nenhuma URL configurada no .env pra testar (ou PRINCIPAL_URL vazio).")
        sys.exit(1)
 
    logger.info(
        "Canal do browser: %s | Headless: %s | Auth whitelist: %r",
        BROWSER_CHANNEL, not args.headed, SN_AUTH_DOMAINS,
    )
 
    if not SN_USER or not SN_PASS:
        logger.error(
            "SN_USER/SN_PASS não definidos no .env — o ServiceNow pediu "
            "ERR_INVALID_AUTH_CREDENTIALS na última tentativa, o que indica "
            "Basic Auth (usuário/senha), não NTLM automático. Sem essas "
            "credenciais o browser não tem como se autenticar."
        )
 
    results = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel=BROWSER_CHANNEL, headless=not args.headed)
        context = browser.new_context(
            accept_downloads=True,
            http_credentials={"username": SN_USER, "password": SN_PASS} if SN_USER and SN_PASS else None,
        )
        page = context.new_page()
 
        for table_name, url in targets:
            path = try_download(page, table_name, url, headless=not args.headed)
            results[table_name] = path
            if path:
                preview_csv(path)
 
        context.close()
        browser.close()
 
    print("\n=== RESUMO ===")
    ok = sum(1 for v in results.values() if v)
    for name, path in results.items():
        status = "OK" if path else "FALHOU"
        print(f"  [{status}] {name}")
    print(f"\n{ok}/{len(results)} baixados com sucesso.")
 
 
if __name__ == "__main__":
    main()