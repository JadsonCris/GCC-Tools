# services/team_service.py
"""
Camada única de acesso ao roster da equipa (tabela `team_members`,
dashboard.db) — substitui 6 cópias parciais da mesma informação que
estavam espalhadas por outros ficheiros (USUARIOS aqui, TEAM_PT/TEAM_BR
em operational_activity_service.py, HIDDEN_TECNICOS/MONITORIZACAO_NOMES
em transform.py, a conta do bot AIOPS duplicada em cache.py e
ci_service.py, e a tabela app_admins à parte para admins). RESOLVIDO:
já causou um bug real nesta sessão (TEAM_PT/TEAM_BR desatualizado,
4 pessoas a cair em "Sem equipa" por a lista não seguir o mesmo roster).

Cada pessoa tem: username (curto do ServiceNow, ex: "EX134172" —
NULLABLE: duas entradas antigas de nome só, sem username conhecido, ver
seed), name (nome tal como aparece em "Opened by"/"Técnico", SEM sufixo
"Claranet"), team ("PT"/"BR"/None), is_admin, is_hidden (exclui de
TODAS as métricas), force_monitorizacao (força classificação
"Monitorização" mesmo sem o sufixo de nome "OM"), is_bot (contas de
automação, ex: AIOPS).
"""
import re
import sqlite3
from datetime import datetime

import pandas as pd

from cache import DB_PATH
from config import settings

_INC_PATTERN = re.compile(r"(INC\d+)")


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# Cache em processo do roster inteiro — team_members é pequena (dezenas
# de linhas) e lida MUITAS vezes por pedido (ex: username_to_tecnico()
# por linha de milhares de eventos/CI's). Sem isto, cada linha abre uma
# ligação SQLite nova — já causou uma lentidão real (get_range_summary a
# passar de <1s pra dezenas de segundos) quando os acessores abaixo
# ainda liam diretamente da BD a cada chamada. Invalidada em qualquer
# escrita (add/update/remove/seed) — NOTA: só válida dentro de UM
# processo; um deploy futuro com vários workers uvicorn precisaria de
# invalidação partilhada (ex: reler sempre, ou um TTL curto).
_cache: list[dict] | None = None


def _invalidate_cache() -> None:
    global _cache
    _cache = None


def _members_cached() -> list[dict]:
    global _cache
    if _cache is None:
        _cache = _read_all_members()
    return _cache


def ensure_schema():
    conn = _connect()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS team_members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE,
                name TEXT NOT NULL UNIQUE,
                team TEXT,
                is_admin INTEGER NOT NULL DEFAULT 0,
                is_hidden INTEGER NOT NULL DEFAULT 0,
                force_monitorizacao INTEGER NOT NULL DEFAULT 0,
                is_bot INTEGER NOT NULL DEFAULT 0,
                added_at TEXT NOT NULL
            )
        """)
        conn.commit()
    finally:
        conn.close()


# --- Seed (migração única dos valores hardcoded anteriores) -----------------
# Mantidos aqui só para a migração — depois de semeada, a BD é que manda;
# não usar estas constantes em lado nenhum fora de seed_if_empty().
_SEED_USUARIOS = {
    "EX132427": "André Fernandes",
    "EX161061": "Adenilza Ribeiro",
    "EX133720": "André Negry",
    "EX141684": "Bruno Caramelo",
    "EX157485": "Diego Santos",
    "EX169165": "Diogo Mendes",
    "EX167354": "Duarte Jorge",
    "EX148860": "Edio Vital",
    "EX150640": "Emanuel Vital",
    "EX165744": "Fernando Januário",
    "EX134172": "Francisco Salgado",
    "EX148861": "Guilherme Silva",
    "EX122721": "Jadson Silva",
    "EX168176": "José Pereira",
    "EX137282": "Miguel Santos",
    "EX144016": "Ricardo Silva",
    "EX165004": "Rodolfo Coelho",
    "EX159746": "Tiago Gouveia",
}
_SEED_TEAM_PT = {
    "Rodolfo Coelho", "Tiago Gouveia", "Jadson Silva", "José Pereira",
    "Miguel Santos", "Diogo Mendes", "Duarte Jorge", "Fernando Januário",
    "Francisco Salgado", "André Fernandes", "Ricardo Silva",
}
_SEED_TEAM_BR = {
    "André Negry", "Bruno Caramelo", "Diego Santos", "Edio Vital",
    "Guilherme Silva", "Emanuel Vital", "Adenilza Ribeiro",
}
# Nomes sem username conhecido (não fazem parte de USUARIOS) — pessoas
# que só existiam como entradas soltas de nome nos ficheiros antigos.
_SEED_HIDDEN_NAMES = {"Luís Miguel Martins"}
_SEED_MONITORIZACAO_NAMES = {"DENIS TEXEIRA CLARANET"}
_SEED_BOTS = {"SAAIOPSP14": "AIOPS"}


def seed_if_empty():
    """
    Semeia team_members a partir dos valores hardcoded anteriores — só se
    a tabela ainda estiver vazia (idempotente, mesmo padrão de
    turnos_service.seed_if_empty). Preserva os admins que já tinham sido
    adicionados na tabela antiga `app_admins` (criada numa sessão
    anterior desta migração), se essa tabela ainda existir, antes dela
    deixar de ser usada.
    """
    ensure_schema()
    conn = _connect()
    try:
        count = conn.execute("SELECT COUNT(*) FROM team_members").fetchone()[0]
        if count > 0:
            return

        existing_admins: set[str] = set()
        try:
            existing_admins = {
                r[0] for r in conn.execute("SELECT username FROM app_admins").fetchall()
            }
        except sqlite3.OperationalError:
            pass  # app_admins pode não existir (instalação nova, sem migração anterior)
        # INITIAL_ADMIN_USERS (.env) — só usado nesta seed, numa instalação
        # de raiz sem app_admins nenhuma pra migrar (sem isto, uma
        # instalação nova ficava sem NENHUM admin e sem forma de criar o
        # primeiro, já que o próprio painel de admins é admin-only).
        existing_admins |= {
            u.strip().upper() for u in settings.INITIAL_ADMIN_USERS.split(",") if u.strip()
        }

        now = datetime.now().isoformat()
        rows = []
        for username, name in _SEED_USUARIOS.items():
            team = "PT" if name in _SEED_TEAM_PT else "BR" if name in _SEED_TEAM_BR else None
            rows.append((
                username, name, team,
                1 if username in existing_admins else 0,
                1 if name in _SEED_HIDDEN_NAMES else 0,
                1 if name in _SEED_MONITORIZACAO_NAMES else 0,
                0, now,
            ))
        for name in _SEED_HIDDEN_NAMES | _SEED_MONITORIZACAO_NAMES:
            if any(r[1] == name for r in rows):
                continue  # já coberto por alguém de USUARIOS acima
            rows.append((
                None, name, None, 0,
                1 if name in _SEED_HIDDEN_NAMES else 0,
                1 if name in _SEED_MONITORIZACAO_NAMES else 0,
                0, now,
            ))
        for username, name in _SEED_BOTS.items():
            rows.append((username, name, None, 0, 0, 0, 1, now))

        conn.executemany(
            "INSERT INTO team_members "
            "(username, name, team, is_admin, is_hidden, force_monitorizacao, is_bot, added_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            rows,
        )
        conn.execute("DROP TABLE IF EXISTS app_admins")
        conn.commit()
        _invalidate_cache()
    finally:
        conn.close()


# --- Leitura ------------------------------------------------------------

def _read_all_members() -> list[dict]:
    conn = _connect()
    try:
        rows = conn.execute("SELECT * FROM team_members ORDER BY name").fetchall()
        return [_row_to_dict(r) for r in rows]
    finally:
        conn.close()


def list_members() -> list[dict]:
    return _members_cached()


def _row_to_dict(r: sqlite3.Row) -> dict:
    return {
        "id": r["id"],
        "username": r["username"],
        "name": r["name"],
        "team": r["team"],
        "is_admin": bool(r["is_admin"]),
        "is_hidden": bool(r["is_hidden"]),
        "force_monitorizacao": bool(r["force_monitorizacao"]),
        "is_bot": bool(r["is_bot"]),
    }


def get_usuarios() -> dict[str, str]:
    """{username: name} só de operadores humanos com username conhecido
    (exclui bots — ver bot_usernames()) — substitui o antigo dict
    USUARIOS (ex: cache._build_despromovidos_url)."""
    return {m["username"]: m["name"] for m in _members_cached() if m["username"] and not m["is_bot"]}


def bot_usernames() -> list[str]:
    """Usernames de contas de automação (ex: AIOPS) — substitui
    cache.DESPROMOVIDOS_EXTRA_USERNAMES / ci_service.AIOPS_USERNAME."""
    return [m["username"] for m in _members_cached() if m["is_bot"] and m["username"]]


def username_to_tecnico(username) -> str:
    """"EX132427" -> "André Fernandes Claranet" (mesmo formato de "Opened by").
    Contas de bot (ex: AIOPS) devolvem o nome tal como gravado, SEM o
    sufixo " Claranet" (não são operadores da Claranet, são contas de
    automação). Username sem mapa conhecido é devolvido tal como veio,
    pra não perder o dado."""
    key = str(username).strip()
    for m in _members_cached():
        if m["is_bot"] and m["username"] == key:
            return m["name"]
    nome = get_usuarios().get(key)
    return f"{nome} Claranet" if nome else str(username)


def username_by_tecnico(tecnico: str) -> str | None:
    """
    Inverso de username_to_tecnico — "André Fernandes Claranet" (ou
    "AIOPS", pro bot) -> "EX132427". Usado pelo Ranking de Atividade
    Operacional (Central Operacional > Visão Global), que só tem o
    "tecnico" (nome, vindo dos eventos abertos/resolvidos/CI's) e
    precisa mostrar o "Nº EX" de cada um. Aceita o nome com ou sem o
    sufixo " Claranet" (inclui bots, ao contrário de get_usuarios(), que
    os exclui de propósito).
    """
    key = str(tecnico or "").strip()
    if key.endswith(" Claranet"):
        key = key[: -len(" Claranet")]
    for m in _members_cached():
        if m["name"] == key and m["username"]:
            return m["username"]
    return None


def normalize_bot_name(name: str) -> str:
    """
    Colapsa qualquer nome que comece por "AIOPS" (ex: "AIOPS Integração
    Snowp14", tal como vem direto da coluna "Opened by" do ServiceNow)
    pro nome canónico do bot gravado em team_members. Sem isto, o mesmo
    bot aparecia como DUAS "pessoas" diferentes consoante a fonte —
    Abertos usa o nome bruto do ServiceNow, mas Resolvidos/CI's usam o
    username curto traduzido via username_to_tecnico (que já devolve o
    nome canónico) — fragmentando as estatísticas do bot em Atividade
    Operacional/Timeline. Mesma deteção por prefixo já usada em
    transform.AIOPER_PREFIX.
    """
    if str(name or "").upper().startswith("AIOPS"):
        bot = next((m for m in _members_cached() if m["is_bot"]), None)
        if bot:
            return bot["name"]
    return name


def team_by_name() -> dict[str, str]:
    """{nome: "PT"|"BR"} pra todos que têm equipa atribuída — continua a
    ser recomendado pré-carregar isto fora de um loop/`.apply()` (ver
    operational_activity_service.py) mesmo com a cache, pra não
    reconstruir o dict a cada linha."""
    return {m["name"]: m["team"] for m in _members_cached() if m["team"]}


def team_of_name(tecnico: str, lookup: dict[str, str] | None = None) -> str:
    """
    PT/BR/"-" a partir do nome (com ou sem sufixo " Claranet"). `lookup`
    opcional (team_by_name(), já em memória) evita uma query à BD por
    chamada — sempre pré-carregar e passar `lookup` quando isto for
    chamado em massa (por linha de um DataFrame).
    """
    base = str(tecnico or "").replace(" Claranet", "").strip()
    if lookup is not None:
        return lookup.get(base, "-")
    return team_by_name().get(base, "-")


def hidden_names_upper() -> set[str]:
    """Nomes a excluir de TODAS as métricas, já em maiúsculas — substitui
    transform.HIDDEN_TECNICOS (comparado contra a coluna "Opened by"
    normalizada em maiúsculas)."""
    return {m["name"].upper() for m in _members_cached() if m["is_hidden"]}


def monitorizacao_override_names() -> set[str]:
    """Nomes com override de classificação "Monitorização", tal como
    gravados (sem transformação de maiúsculas) — substitui
    transform.MONITORIZACAO_NOMES, preservando a comparação exata já
    usada (ver transform.add_grupo_column, comentário sobre comparar
    "tal como veio")."""
    return {m["name"] for m in _members_cached() if m["force_monitorizacao"]}


def is_admin(username: str | None) -> bool:
    if not username:
        return False
    return any(m["username"] == username and m["is_admin"] for m in _members_cached())


# --- Escrita (CRUD — painel "Gestão de Equipa") ------------------------

_VALID_TEAMS = {"PT", "BR"}


def _validate_team(team: str | None) -> None:
    if team is not None and team not in _VALID_TEAMS:
        raise ValueError(f"Equipa inválida: '{team}' (esperado 'PT', 'BR' ou vazio).")


def add_member(
    name: str, username: str | None = None, team: str | None = None,
    is_admin: bool = False, is_hidden: bool = False, force_monitorizacao: bool = False,
) -> dict:
    name = name.strip()
    if not name:
        raise ValueError("Nome não pode ser vazio.")
    _validate_team(team)
    username = username.strip().upper() if username and username.strip() else None
    conn = _connect()
    try:
        try:
            cur = conn.execute(
                "INSERT INTO team_members "
                "(username, name, team, is_admin, is_hidden, force_monitorizacao, is_bot, added_at) "
                "VALUES (?, ?, ?, ?, ?, ?, 0, ?)",
                (username, name, team, int(is_admin), int(is_hidden), int(force_monitorizacao),
                 datetime.now().isoformat()),
            )
        except sqlite3.IntegrityError as exc:
            raise ValueError(
                f"Já existe alguém com o nome '{name}'" + (f" ou o código '{username}'." if username else ".")
            ) from exc
        conn.commit()
        _invalidate_cache()
        return _row_to_dict(conn.execute("SELECT * FROM team_members WHERE id = ?", (cur.lastrowid,)).fetchone())
    finally:
        conn.close()


def _admin_count(conn: sqlite3.Connection, exclude_id: int | None = None) -> int:
    if exclude_id is None:
        return conn.execute("SELECT COUNT(*) FROM team_members WHERE is_admin = 1").fetchone()[0]
    return conn.execute(
        "SELECT COUNT(*) FROM team_members WHERE is_admin = 1 AND id != ?", (exclude_id,)
    ).fetchone()[0]


def update_member(member_id: int, **fields) -> None:
    """
    Campos aceites: name, username, team, is_admin, is_hidden,
    force_monitorizacao. `team`/`username` aceitam None explícito (o
    seletor "—" do frontend limpa a equipa mandando `team: null`) — só os
    booleanos e "name" ignoram None (checkboxes nunca mandam null, e
    "name" é NOT NULL na BD). Recusa desmarcar is_admin se isso deixasse a
    equipa sem NENHUM admin (evita trancar todos de fora sem querer).
    """
    allowed = {"name", "username", "team", "is_admin", "is_hidden", "force_monitorizacao"}
    nullable = {"team", "username"}
    updates = {k: v for k, v in fields.items() if k in allowed and (v is not None or k in nullable)}
    if not updates:
        return
    if "team" in updates:
        _validate_team(updates["team"])
    if "username" in updates and isinstance(updates["username"], str):
        updates["username"] = updates["username"].strip().upper() or None
    if "name" in updates:
        if not isinstance(updates["name"], str) or not updates["name"].strip():
            raise ValueError("Nome não pode ser vazio.")
        updates["name"] = updates["name"].strip()

    conn = _connect()
    try:
        if "is_admin" in updates and not updates["is_admin"]:
            row = conn.execute("SELECT is_admin FROM team_members WHERE id = ?", (member_id,)).fetchone()
            if row and row["is_admin"] and _admin_count(conn, exclude_id=member_id) == 0:
                raise ValueError("Não é possível remover o último administrador.")

        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = [int(v) if isinstance(v, bool) else v for v in updates.values()]
        values.append(member_id)
        try:
            conn.execute(f"UPDATE team_members SET {set_clause} WHERE id = ?", values)
        except sqlite3.IntegrityError as exc:
            raise ValueError("Já existe alguém com esse nome ou código.") from exc
        conn.commit()
        _invalidate_cache()
    finally:
        conn.close()


def remove_member(member_id: int) -> None:
    conn = _connect()
    try:
        row = conn.execute("SELECT is_admin FROM team_members WHERE id = ?", (member_id,)).fetchone()
        if row and row["is_admin"] and _admin_count(conn, exclude_id=member_id) == 0:
            raise ValueError("Não é possível remover o último administrador.")
        conn.execute("DELETE FROM team_members WHERE id = ?", (member_id,))
        conn.commit()
        _invalidate_cache()
    finally:
        conn.close()


# --- Atividade de equipa (tabela "ok_") ---------------------------------

def get_team_activity(df_principal_enriched: pd.DataFrame, df_ok_raw: pd.DataFrame | None) -> list[dict]:
    """
    Por técnico: nº de incidentes abertos (coluna "Técnico" do principal
    já enriquecido/filtrado) + nº de tags "OK_GCC" feitas (tabela "ok_",
    coluna "Created by" — username curto, traduzido via username_to_tecnico
    acima).

    `df_ok_raw` já deve vir filtrado pelo chamador (ver history_service)
    pros mesmos incidentes do período/região selecionados — faz isso
    cruzando o número extraído de "Title" ("Incident - INC0030238") com
    o conjunto de incidentes do `df_principal_enriched`, já que a tabela
    "ok_" não tem campo de região próprio.
    """
    opened = df_principal_enriched["Técnico"].apply(normalize_bot_name).value_counts()

    if df_ok_raw is not None and not df_ok_raw.empty and "Created by" in df_ok_raw.columns:
        ok_df = df_ok_raw.copy()
        if "Label" in ok_df.columns:
            ok_df = ok_df[ok_df["Label"] == "OK_GCC"]
        ok_df["_tecnico"] = ok_df["Created by"].apply(username_to_tecnico)
        ok_counts = ok_df.groupby("_tecnico").size()
    else:
        ok_counts = pd.Series(dtype=int)

    names = sorted(set(opened.index) | set(ok_counts.index))
    result = [
        {
            "tecnico": name,
            "incidentes_abertos": int(opened.get(name, 0)),
            "tags_ok": int(ok_counts.get(name, 0)),
        }
        for name in names
    ]
    result.sort(key=lambda r: r["incidentes_abertos"], reverse=True)
    return result


def filter_ok_by_incident_set(df_ok_raw: pd.DataFrame | None, incident_numbers: set[str]) -> pd.DataFrame | None:
    """
    Restringe a tabela "ok_" (sem região/técnico-enriquecido próprio) aos
    incidentes que já passaram pelo filtro de período+região+técnicos
    ocultos+cancelados do principal — extrai o número de "Title" (ex:
    "Incident - INC0030238", ou "Incidente - ..." em algumas linhas,
    ambos batem no mesmo regex).
    """
    if df_ok_raw is None or df_ok_raw.empty or "Title" not in df_ok_raw.columns:
        return df_ok_raw
    numbers = df_ok_raw["Title"].astype(str).str.extract(_INC_PATTERN, expand=False)
    return df_ok_raw[numbers.isin(incident_numbers)]
