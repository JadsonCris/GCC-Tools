# services/ponto_situacao_service.py
"""
Ponto de Situação — pede a uma equipa ServiceNow (view "Equipa") ou ao
TL/Backup TL de uma aplicação CMDB (view "TL's") um ponto de situação
sobre um incidente, com e-mail pré-preenchido (destinatários, assunto,
corpo, comentário) a partir de 4 tabelas de referência importadas de
exports do ServiceNow: userscmdb, equipas (membros de equipa), incsopen
(incidentes abertos), apps (CMDB de aplicações).

Porta de uma ferramenta standalone (app.py, Flask) — mesma lógica,
tabelas gravadas no dashboard.db (prefixo "ps_", ver [[project-gcc-tools-unification]]
em memória) em vez de um ponto_situacao.db à parte.
"""
import logging
import re
import sqlite3
from datetime import datetime

import pythoncom
import win32com.client

from cache import DB_PATH

logger = logging.getLogger("ponto_situacao")

# CC fixo replicado das macros VBA StatusRequestEmailequipas / StatusRequestEmail
# do ficheiro "PONTOS DE SITUAÇÃO edpon 0.5(beta).xlsm"
CC_PADRAO = "franciscosalgado.claranet@edp.com; RicardoSilva.Claranet@edp.com; andrefernandes.claranet@edp.com"

TABELAS_VALIDAS = {"userscmdb", "equipas", "incsopen", "apps"}


def _tabela_fisica(tabela: str) -> str:
    return f"ps_{tabela}"


# ------------------------------------------------------------------------------
# BASE DE DADOS (SQLite, dashboard.db) — ps_userscmdb, ps_equipas, ps_incsopen, ps_apps
# ------------------------------------------------------------------------------

def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("CREATE TABLE IF NOT EXISTS ps_meta (tabela TEXT PRIMARY KEY, atualizado_em TEXT)")
    return conn


def obter_atualizacao(tabela: str) -> str | None:
    conn = _connect()
    try:
        r = conn.execute("SELECT atualizado_em FROM ps_meta WHERE tabela=?", (tabela,)).fetchone()
        return r["atualizado_em"] if r else None
    finally:
        conn.close()


def tabela_existe(tabela: str) -> bool:
    conn = _connect()
    try:
        r = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (_tabela_fisica(tabela),)
        ).fetchone()
        return r is not None
    finally:
        conn.close()


def obter_tabela(tabela: str) -> tuple[list[dict], list[str]]:
    if not tabela_existe(tabela):
        return [], []
    conn = _connect()
    try:
        linhas = [dict(r) for r in conn.execute(f'SELECT * FROM "{_tabela_fisica(tabela)}"').fetchall()]
    finally:
        conn.close()
    colunas = list(linhas[0].keys()) if linhas else []
    return linhas, colunas


def sanitizar_coluna(nome: str, idx: int) -> str:
    limpo = re.sub(r"[^a-zA-Z0-9_]", "_", (nome or "").strip()) or f"col_{idx}"
    if limpo[0].isdigit():
        limpo = f"c_{limpo}"
    return limpo.lower()


def importar_linhas_para_tabela(tabela: str, linhas: list[dict], modo: str) -> dict:
    """
    Recebe linhas já convertidas em objetos {coluna: valor} pelo SheetJS no
    browser (funciona tanto para .csv como para .xls/.xlsx reais — incluindo
    os exports binários do ServiceNow, que um parser de CSV não consegue ler).
    """
    if tabela not in TABELAS_VALIDAS:
        raise ValueError("Tabela inválida")
    if not linhas:
        raise ValueError("Ficheiro vazio ou sem linhas de dados")

    colunas_originais = []
    vistas = set()
    for linha in linhas:
        for chave in linha.keys():
            if chave not in vistas:
                vistas.add(chave)
                colunas_originais.append(chave)

    colunas = [sanitizar_coluna(c, i) for i, c in enumerate(colunas_originais)]
    tabela_fisica = _tabela_fisica(tabela)

    conn = _connect()
    try:
        cur = conn.cursor()
        if modo == "substituir":
            cur.execute(f'DROP TABLE IF EXISTS "{tabela_fisica}"')
        col_defs = ", ".join(f'"{c}" TEXT' for c in colunas)
        cur.execute(f'CREATE TABLE IF NOT EXISTS "{tabela_fisica}" ({col_defs})')

        col_sql = ", ".join(f'"{c}"' for c in colunas)
        placeholders = ", ".join("?" for _ in colunas)
        valores = [
            ["" if linha.get(chave) is None else str(linha.get(chave)) for chave in colunas_originais]
            for linha in linhas
        ]
        cur.executemany(f'INSERT INTO "{tabela_fisica}" ({col_sql}) VALUES ({placeholders})', valores)
        cur.execute(
            "INSERT INTO ps_meta (tabela, atualizado_em) VALUES (?, ?) "
            "ON CONFLICT(tabela) DO UPDATE SET atualizado_em=excluded.atualizado_em",
            (tabela, datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
        )
        conn.commit()
        total = cur.execute(f'SELECT COUNT(*) FROM "{tabela_fisica}"').fetchone()[0]
    finally:
        conn.close()
    return {"colunas": colunas, "linhas": total}


def limpar_tabela(tabela: str) -> None:
    if tabela not in TABELAS_VALIDAS:
        raise ValueError("Tabela inválida")
    conn = _connect()
    try:
        conn.execute(f'DROP TABLE IF EXISTS "{_tabela_fisica(tabela)}"')
        conn.execute("DELETE FROM ps_meta WHERE tabela=?", (tabela,))
        conn.commit()
    finally:
        conn.close()


def resolver_coluna(colunas: list[str], candidatos: list[str]) -> str | None:
    norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())
    mapa = {norm(c): c for c in colunas}
    for cand in candidatos:
        k = norm(cand)
        if k in mapa:
            return mapa[k]
    for cand in candidatos:
        k = norm(cand)
        for c in colunas:
            if k in norm(c):
                return c
    return None


# ------------------------------------------------------------------------------
# LÓGICA DE NEGÓCIO — replica as fórmulas das folhas "emailequipas" / "emailTL's"
# ------------------------------------------------------------------------------

def _contem(padrao: str, texto: str) -> bool:
    return re.search(padrao, texto or "", re.IGNORECASE) is not None


# Réplica literal do SWITCH da célula C4 de "emailequipas". A 1ª regra devolve
# "PDS_MIM" (não é uma lista de emails) — assim está no ficheiro original,
# mantido tal-e-qual; corrigir aqui se for de facto um erro de preenchimento.
OVERRIDES_EQUIPA = [
    (lambda g: g == "DGU_EDPON_PRO-Monitoring", "PDS_MIM"),
    (
        lambda g: g
        in {
            "DGU_EDPON_PRO-MSP-Wintel IO_Support",
            "DGU_EDPON_PRO-MSP-Backup IO_Support",
            "DGU_EDPON_PRO-MSP-Unix IO_Support",
            "DGU_EDPON_PRO-MSP-Cloud Ops (IO)_Support",
            "DGU_EDPON_PRO-MSP-System IO_Support",
            "DGU_EDPON_PRO-MSP-Networking IO_Support",
        },
        "helio.pinto@accenture.com; luis.c.fernandes@accenture.com; ricardo.c.sousa@accenture.com; "
        "santiago.martin.nuno@accenture.com; ismael.perez.garcia@accenture.com; rui.pedro.v.padrao@accenture.com; "
        "b.g.silva@avanade.com; claudio.bruno.franco@accenture.com",
    ),
    (
        lambda g: _contem("ACCENTURE", g),
        "nuno.rosmaninho@accenture.com; helder.machaqueiro@accenture.com; joao.s.soares@accenture.com; "
        "helio.pinto@accenture.com; luis.c.fernandes@accenture.com",
    ),
    (lambda g: _contem("DECSKILL", g), "luis.correia@decskill.com; goncalo.valente@decskill.com"),
    (lambda g: _contem("CGI", g), "helena.cunha@cgi.com; francisco.valente@cgi.com"),
    (
        lambda g: _contem("DELOITTE", g),
        "jflorentino@deloitte.pt; jomarais@deloitte.pt; stmonteiro@deloitte.pt; "
        "antoniomotalopes.deloitte@edp.com; joaomarquesmonteiro.deloitte@edp.com",
    ),
    (lambda g: "DGU_EDPON_PRO-ADMO-Database_DXC" in (g or ""), "barbara.ferreira@dxc.com"),
    (lambda g: _contem("INETUM", g), "jose.alves@inetum.com; paulo.damas.ramos@inetum.com"),
    (lambda g: _contem("MINSAIT", g), "hmfernandes@eservicios.indracompany.com; jrpereiras@minsait.com"),
    (
        lambda g: _contem("NTTDATA", (g or "").replace(" ", "")),
        "Nuno.FernandesSantos@nttdata.com; AnaPatricia.MacedoAgrelos@nttdata.com",
    ),
    (lambda g: _contem("TCS", g), "ramos.jorge@tcs.com"),
]


def emails_equipa(equipa: str) -> str:
    if not equipa:
        return ""
    for teste, emails in OVERRIDES_EQUIPA:
        if teste(equipa):
            return emails

    membros, cols_m = obter_tabela("equipas")
    utilizadores, cols_u = obter_tabela("userscmdb")
    if not membros or not utilizadores:
        return ""

    col_grupo = resolver_coluna(cols_m, ["group"])
    col_user = resolver_coluna(cols_m, ["user"])
    col_nome = resolver_coluna(cols_u, ["name"])
    col_email = resolver_coluna(cols_u, ["email"])
    if not all([col_grupo, col_user, col_nome, col_email]):
        return ""

    nomes = {
        str(r.get(col_user, "")).strip().lower()
        for r in membros
        if str(r.get(col_grupo, "")).strip() == equipa.strip()
    }
    nomes.discard("")

    emails = set()
    for u in utilizadores:
        nome = str(u.get(col_nome, "")).strip().lower()
        if nome in nomes:
            email = str(u.get(col_email, "")).strip()
            if email:
                emails.add(email)
    return "; ".join(sorted(emails))


def emails_tl(aplicacao: str) -> str:
    if not aplicacao:
        return ""
    apps, cols_a = obter_tabela("apps")
    utilizadores, cols_u = obter_tabela("userscmdb")
    if not apps or not utilizadores:
        return ""

    col_nome_app = resolver_coluna(cols_a, ["name"])
    col_owner = resolver_coluna(cols_a, ["it_application_owner", "application owner"])
    col_backup = resolver_coluna(
        cols_a, ["u_it_application_owner_backup", "application owner backup", "it application owner backup"]
    )
    if not col_nome_app:
        return ""

    linha = next(
        (r for r in apps if str(r.get(col_nome_app, "")).strip().lower() == aplicacao.strip().lower()),
        None,
    )
    if not linha:
        return ""

    alvos = {
        str(linha.get(col_owner, "")).strip().lower() if col_owner else "",
        str(linha.get(col_backup, "")).strip().lower() if col_backup else "",
    }
    alvos.discard("")
    if not alvos:
        return ""

    col_nome = resolver_coluna(cols_u, ["name"])
    col_email = resolver_coluna(cols_u, ["email"])
    emails = set()
    for u in utilizadores:
        nome = str(u.get(col_nome, "")).strip().lower()
        if nome in alvos:
            email = str(u.get(col_email, "")).strip()
            if email:
                emails.add(email)
    return "; ".join(sorted(emails))


def outros_incidentes(campo: str, valor: str) -> list[dict]:
    incidentes, cols = obter_tabela("incsopen")
    if not incidentes or not valor:
        return []

    col_num = resolver_coluna(cols, ["number"])
    col_estado = resolver_coluna(cols, ["incident_state", "state"])
    col_abertura = resolver_coluna(cols, ["opened_at"])
    col_update = resolver_coluna(cols, ["sys_updated_on"])
    col_grupo = resolver_coluna(cols, ["assignment_group"])
    col_sub = resolver_coluna(cols, ["u_subcategory", "subcategory"])
    col_filtro = col_grupo if campo == "grupo" else col_sub
    if not col_filtro:
        return []

    resultado = []
    for r in incidentes:
        if str(r.get(col_filtro, "")).strip().lower() == valor.strip().lower():
            resultado.append(
                {
                    "numero": r.get(col_num, "") if col_num else "",
                    "estado": r.get(col_estado, "") if col_estado else "",
                    "abertura": r.get(col_abertura, "") if col_abertura else "",
                    "ultima_atualizacao": r.get(col_update, "") if col_update else "",
                    "grupo": r.get(col_grupo, "") if col_grupo else "",
                }
            )
    return resultado


def grupos_distintos() -> list[str]:
    """Lista única de grupos — equivalente à folha 'equipas' do ficheiro original."""
    membros, cols = obter_tabela("equipas")
    col_grupo = resolver_coluna(cols, ["group"])
    if not membros or not col_grupo:
        return []
    return sorted({str(r.get(col_grupo, "")).strip() for r in membros if str(r.get(col_grupo, "")).strip()})


def aplicacoes_distintas() -> list[str]:
    apps, cols = obter_tabela("apps")
    col_nome = resolver_coluna(cols, ["name"])
    if not apps or not col_nome:
        return []
    return sorted({str(r.get(col_nome, "")).strip() for r in apps if str(r.get(col_nome, "")).strip()})


def montar_pedido_equipa(incidente: str, equipa: str) -> dict:
    emails = emails_equipa(equipa)
    outros = outros_incidentes("grupo", equipa)
    incs_join = "/".join(str(o["numero"]) for o in outros)

    assunto = f"Ponto de situação {incidente}" if incidente else ""
    corpo = (
        "Boa noite,\n\n"
        f"Solicitamos um ponto de situação relativo aos {incidente} que se encontram atribuídos à equipa {equipa}, "
        "de modo a obter informações atualizadas sobre o progresso ou quaisquer ações pendentes. Se possível, "
        "agradecia que os incidentes fossem atualizados com a informação mais recente disponível.\n\n"
        "Agradeço desde já pela atenção e fico ao dispor para quaisquer esclarecimentos adicionais que possam ser "
        "necessários.\n\nCom os melhores cumprimentos,"
        if incidente and equipa
        else ""
    )
    comentario = (
        f"Bom dia,\nEnviado email para todos os elementos da equipa {equipa} a solicitar um ponto de situação "
        "sobre o tema. Obrigado"
        if equipa
        else ""
    )

    return {
        "emails": emails,
        "assunto": assunto,
        "corpo": corpo,
        "comentario": comentario,
        "incs": incs_join,
        "outros": outros,
    }


def montar_pedido_tl(incidente: str, aplicacao: str) -> dict:
    emails = emails_tl(aplicacao)
    outros = outros_incidentes("subcategoria", aplicacao)
    incs_join = "/".join(str(o["numero"]) for o in outros)

    assunto = f"Ponto de situação {incidente}" if incidente else ""
    corpo = (
        "Bom dia,\n\n"
        f"Solicitamos um ponto de situação relativo ao {incidente} da aplicação {aplicacao}, de modo a obter "
        "informações atualizadas sobre o progresso ou quaisquer ações pendentes. Se possível, agradecia que o "
        "incidente fosse atualizado com a informação mais recente disponível.\n\nAgradeço desde já pela atenção e "
        "fico ao dispor para quaisquer esclarecimentos adicionais que possam ser necessários.\n\nCom os melhores "
        "cumprimentos,"
        if incidente and aplicacao
        else ""
    )
    comentario = "Bom dia,\nEnviado email para  TL e Backup TL a solicitar um ponto de situação sobre o tema.\nObrigado"

    return {
        "emails": emails,
        "assunto": assunto,
        "corpo": corpo,
        "comentario": comentario,
        "incs": incs_join,
        "outros": outros,
    }


def gerar_email_ponto_situacao(to: str, subject: str, body: str, cc: str | None = None) -> tuple[bool, str]:
    """Abre um rascunho no Outlook (.Display, não envia) — equivalente às macros
    StatusRequestEmailequipas (view Equipa) e StatusRequestEmail (view TL's)."""
    destinatario = (to or "").strip()
    if not destinatario:
        return False, "Sem destinatários: verifique o campo de emails antes de gerar o e-mail."

    pythoncom.CoInitialize()
    try:
        outlook = win32com.client.Dispatch("Outlook.Application")
        mail = outlook.CreateItem(0)
        mail.To = destinatario
        mail.CC = (cc or CC_PADRAO).strip()
        mail.Subject = subject or ""
        mail.Body = body or ""
        mail.Display()
        return True, "E-mail gerado com sucesso no Outlook!"
    except Exception as e:  # noqa: BLE001
        logger.exception("Falha ao gerar e-mail de Ponto de Situação")
        return False, str(e)
