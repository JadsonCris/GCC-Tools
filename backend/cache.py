# cache.py
"""
Job de atualização em background. A cada ciclo:

  1. Tenta baixar cada relatório CSV do ServiceNow automaticamente via
     services/servicenow_client.py (cliente robusto).
  2. Para qualquer tabela que falhar na busca automática, verifica se já
     existe um CSV em downloads/ — quer tenha sido baixado com o nome
     padrão do ServiceNow (ex: "sys_report_template.do.csv") ou já com o
     nome correto da tabela (ex: "sys_report_template.csv"). O mapeamento
     de nomes é lido do .env (SN_FILENAME_*) — ver .env.example.
  3. Salva cada DataFrame obtido (automático ou manual) no SQLite
     (dashboard.db) e remove o CSV de downloads/ assim que o commit é
     confirmado.
  4. Usa os DataFrames pra calcular tudo que a API expõe e guarda em CACHE.

Fluxo prático pro caminho manual:
  - Baixa o CSV pelo navegador (abre a URL do .env logado no ServiceNow)
  - O ficheiro fica em Downloads/ com o nome que o ServiceNow der
  - Move pra backend/downloads/ (não precisa renomear — o backend encontra
    pelo mapeamento SN_FILENAME_* do .env)
  - No próximo ciclo (ou reiniciando o servidor) o backend detecta,
    processa e apaga automaticamente

O scheduler roda esse ciclo a cada CACHE_REFRESH_MINUTES (padrão 20) e
também uma vez assim que a app sobe.
"""
import logging
import sqlite3
import threading
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
from apscheduler.schedulers.background import BackgroundScheduler

from config import settings

logger = logging.getLogger("cache")

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "dashboard.db"
DOWNLOADS_DIR = BASE_DIR / "downloads"

from services.servicenow_client import ServiceNowFetchError, _parse_csv_text, fetch_csv  # noqa: E402


def _all_known_p1_numbers() -> list[str]:
    """
    Todos os números de incidente que "sla3_incidentes" (SLA3_URL,
    `priority=1`) já viu alguma vez — active (ainda é P1) + backlog (já
    foi P1, não é mais) — graças ao UPSERT incremental. Base pra montar
    o Despromovidos_URL diretamente pelos incidentes que interessam (ver
    _build_despromovidos_url), em vez de filtrar por quem criou a linha
    de SLA. Lê a BD tal como está NESTE momento — se este ciclo ainda
    não gravou "sla3_incidentes" (é buscada antes de "despromovidos" no
    SERVICENOW_URLS, mas só fica gravada depois, em _store_and_clean_
    csvs), usa a foto do ciclo anterior; um P1 novíssimo só entra no
    Despromovidos_URL a partir do próximo ciclo — atraso de um ciclo,
    sem impacto real (mesma categoria de latência já aceite noutros
    sítios desta app).
    """
    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sla3_incidentes'")
        if cur.fetchone() is None:
            return []
        rows = conn.execute('SELECT DISTINCT "Number" FROM sla3_incidentes WHERE "Number" IS NOT NULL').fetchall()
    finally:
        conn.close()
    return sorted(r[0] for r in rows)


def _build_despromovidos_url() -> str | None:
    """
    Monta a URL do Despromovidos_URL (task_sla_list.do) DINAMICAMENTE a
    partir de _all_known_p1_numbers() (histórico completo de
    sla3_incidentes), em vez de uma URL fixa no .env. Mesmos
    sysparm_fields do SLA4_URL (schema idêntico — ver services/
    sla_service.py prepare_sla_rows, reaproveitado aqui).

    Usado só pra ANOTAR, na página "Major Incs", pra que prioridade cada
    despromovido efetivamente desceu (P2/P3/P4 — ver major_incs_service.
    get_despromovidos_detail); a CLASSIFICAÇÃO "é ou não despromovido"
    já não depende disto, vem do "_status" da própria sla3_incidentes.

    RESOLVIDO 2026-08 (versão anterior, substituída 2026-09): filtrava
    por `sys_created_by=<equipa>^ORslaLIKEP1^ORslaLIKENível 1` — dava só
    uma vista PARCIAL da história de cada task (linhas de SLA de
    prioridades intermédias, criadas por quem não é da equipa e cujo
    nome não menciona "P1"/"Nível 1", ficavam invisíveis). Caso real
    confirmado: INC0055713 tinha 5 linhas de SLA reais, o filtro antigo
    só via 3 — dava falso positivo de despromoção. Filtrar por
    `task.numberIN<...>` com os números que sla3_incidentes já confirma
    como P1 dá a história COMPLETA de cada task, sem depender de quem
    criou a linha nem de convenção de texto no nome da SLA.
    """
    numbers = _all_known_p1_numbers()
    if not numbers:
        return None
    number_filter = ",".join(numbers)
    return (
        "https://edpon.service-now.com/task_sla_list.do?EXCEL"
        f"&sysparm_query=task.sys_class_name=incident^task.numberIN{number_filter}"
        "&sysparm_fields=task,sys_created_on,sla,sla.type,stage,start_time,end_time,"
        "business_duration,business_percentage,active,schedule,sys_created_by"
    )


# Mapeia nome da tabela -> possíveis nomes de ficheiro em downloads/.
# A lista de candidatos por tabela é construída com:
#   1. O nome configurado no .env (SN_FILENAME_{TABLE}) — preenche pra
#      bater com o nome exato que o teu navegador usa ao baixar.
#   2. O nome padrão "{tabela}.csv" — fallback se não configurado no .env.
#   3. O nome típico do export do ServiceNow por URL.
def _build_filename_candidates() -> dict[str, list[str]]:
    tables = {
        # Migração 2026-08: "sys_report_template" virou "gcc_abertos" (a
        # PRINCIPAL_URL agora é o export "GCC Abertos" da instância nova).
        "gcc_abertos": [
            settings.SN_FILENAME_PRINCIPAL,
            "PRINCIPAL_URL.xls",
            "gcc_abertos.xls",
        ],
        "sla3_incidentes": [
            settings.SN_FILENAME_SLA3,
            "SLA3_URL.xls",
            "sla3_incidentes.xls",
        ],
        "sla4": [
            settings.SN_FILENAME_SLA4,
            "SLA4_URL.xls",
            "sla4.xls",
        ],
        "ok_": [
            settings.SN_FILENAME_OK,
            "OK_URL.xls",
            "ok_.xls",
        ],
        # RENOMEADO 2026-08 de "tag_calls_gcc" (era label_entry_list.do,
        # nível de tag/evento) — agora é incident_list.do, incidente a
        # incidente, igual à forma de "gcc_abertos" (ver INCS_CALLS_GCC_URL).
        "incs_calls_gcc": [
            settings.SN_FILENAME_INCS_CALLS_GCC,
            "INCS_CALLS_GCC_URL.xls",
            "incs_calls_gcc.xls",
        ],
        # task_sla_list.do filtrado por autor (ver _build_despromovidos_url
        # acima) — mesmo shape do SLA4_URL, mas restrito à equipa.
        "despromovidos": [
            settings.SN_FILENAME_DESPROMOVIDOS,
            "Despromovidos_URL.xls",
            "despromovidos.xls",
        ],
        # task_ci_list.do — Configuration Items associados a incidentes.
        "cis": [
            settings.SN_FILENAME_CI,
            "CI_URL.xls",
            "cis.xls",
        ],
        # SharePoint (.xlsm), não ServiceNow — só via download manual (ver
        # SERVICENOW_URLS abaixo, sem URL de busca automática).
        "justificacoes": [
            settings.SN_FILENAME_JUSTIFICACOES,
            "JUSTIFICACOES_URL.xlsm",
            "justificacoes.xlsm",
        ],
        # Idem — "Acompanhamento de Calls" (bridge/major incident calls),
        # SharePoint .xlsx. Nome de tabela "calls", diferente de
        # "incs_calls_gcc" (essa é um export do ServiceNow, sem relação).
        "calls": [
            settings.SN_FILENAME_CALLS,
            "CALLS_URL.xlsx",
            "calls.xlsx",
        ],
        # Desativadas por agora (ver .env / config.py) — sem link novo ainda.
        # "sla3_grupos": [settings.SN_FILENAME_SLA3_GRUPOS, "sla3_grupos.csv"],
        # "users": [settings.SN_FILENAME_USERS, "users.csv"],
        # "auditkeys": [settings.SN_FILENAME_AUDITKEYS, "auditkeys.csv"],
        # "mon_backlog_incs": [settings.SN_FILENAME_BACKLOG_INC, "mon_backlog_incs.csv"],
        # "mon_backlog_ritm": [settings.SN_FILENAME_BACKLOG_RITM, "mon_backlog_ritm.csv"],
    }
    # Remove None/vazios de cada lista
    return {k: [n for n in v if n] for k, v in tables.items()}


SERVICENOW_URLS = {
    "gcc_abertos": lambda: settings.PRINCIPAL_URL,
    "sla3_incidentes": lambda: settings.SLA3_URL,
    "sla4": lambda: settings.SLA4_URL,
    "ok_": lambda: settings.OK_URL,
    "incs_calls_gcc": lambda: settings.INCS_CALLS_GCC_URL,
    "despromovidos": _build_despromovidos_url,  # dinâmica — ver função acima
    "cis": lambda: settings.CI_URL,
    # Sempre None: JUSTIFICACOES_URL é SharePoint, não ServiceNow — a auth
    # de SN_USER/SN_PASS não serve pra isso, então nem tenta a busca
    # automática (iria só devolver a página de login em HTML). Cai direto
    # pro download manual em downloads/ (ver fetch_and_download_csvs).
    "justificacoes": lambda: None,
    "calls": lambda: None,  # idem — CALLS_URL também é SharePoint.
    # Desativadas por agora (ver .env / config.py) — sem link novo ainda.
    # "sla3_grupos": lambda: settings.SLA3_GROUPS_URL,
    # "users": lambda: settings.USERS_URL,
    # "auditkeys": lambda: settings.AUDITKEYS_URL,
    # "mon_backlog_incs": lambda: settings.BACKLOG_INC_URL,
    # "mon_backlog_ritm": lambda: settings.BACKLOG_RITM_URL,
}

# Chave natural de cada tabela no SQLite, usada pro UPSERT incremental
# (ver _upsert_dataframe). "sla4" precisa de chave composta porque uma
# mesma Task pode ter várias linhas de SLA diferentes (confirmado nos
# dados reais: mesma "Task" com "Start time" diferentes = SLAs distintos
# anexados à mesma task; quando Task+Start time também colidem, são
# duplicatas genuínas do próprio export do ServiceNow — colapsar é
# desejável, não perda de dado).
TABLE_KEYS: dict[str, tuple[str, ...]] = {
    "gcc_abertos": ("Number",),
    "sla3_incidentes": ("Number",),
    "sla4": ("Task", "Start time"),
    "ok_": ("Title",),
    "incs_calls_gcc": ("Number",),
    "despromovidos": ("Task", "Start time"),
    # CONFIRMADO no primeiro fetch real (backend/downloads/CI_URL.xls):
    # cabeçalhos reais são "Task", "Configuration Item" (I maiúsculo),
    # "Class", "Created by", "Created" — só "Configuration Item" difere
    # do que se assumiu inicialmente (tinha "item" minúsculo).
    "cis": ("Task", "Configuration Item"),
}

CACHE: dict = {"errors": {}, "last_updated": None}


# Algumas tabelas manuais (ex: "justificacoes", um .xlsm do SharePoint
# com várias sheets) precisam de uma sheet específica em vez da primeira
# — ver _read_csv_file(sheet_name=...) e fetch_and_download_csvs().
SHEET_NAMES: dict[str, str] = {
    "justificacoes": "Justificações",
    "calls": "Sheet-1-Acompanhamento de Calls",
}


def _read_csv_file(path: Path, sheet_name: str | None = None) -> pd.DataFrame:
    """
    Lê um ficheiro manual de downloads/. Migração 2026-08: os downloads
    manuais agora são .xls (export EXCEL da instância nova) — lidos via
    pandas/xlrd. Mantém suporte a .csv por compatibilidade com ficheiros
    antigos que ainda possam estar por aí. `.xlsm` (SharePoint) usa o
    mesmo caminho que `.xlsx` — mesmo formato por baixo (openpyxl), só
    com macros a mais que não nos interessam.
    """
    if path.suffix.lower() == ".xls":
        try:
            return pd.read_excel(path, engine="xlrd")
        except Exception as exc:  # noqa: BLE001
            raise ServiceNowFetchError(f"Não consegui ler {path.name} como Excel (.xls): {exc}") from exc

    if path.suffix.lower() in (".xlsx", ".xlsm"):
        try:
            kwargs = {"sheet_name": sheet_name} if sheet_name else {}
            return pd.read_excel(path, **kwargs)
        except Exception as exc:  # noqa: BLE001
            raise ServiceNowFetchError(f"Não consegui ler {path.name} como Excel ({path.suffix}): {exc}") from exc

    for encoding in ("utf-8-sig", "cp1252", "latin-1", "utf-8"):
        try:
            text = path.read_text(encoding=encoding)
            return _parse_csv_text(text, str(path))
        except (UnicodeDecodeError, ServiceNowFetchError):
            continue
    raise ServiceNowFetchError(f"Não consegui ler {path.name} (encoding não reconhecido).")


def _find_manual_csv(table_name: str, candidates: list[str]) -> Path | None:
    """
    Procura em downloads/ pelos nomes candidatos (do .env ou padrões).
    Devolve o Path do primeiro que encontrar, ou None.
    """
    for name in candidates:
        path = DOWNLOADS_DIR / name
        if path.exists():
            return path
    return None


def fetch_and_download_csvs() -> tuple[dict, dict]:
    """
    Busca cada relatório: tenta a via automática primeiro; se falhar,
    procura o CSV manual em downloads/ (por qualquer nome candidato)
    antes de desistir de vez.
    """
    DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
    filename_candidates = _build_filename_candidates()
    dfs: dict = {}
    errors: dict = {}

    for table_name, url_getter in SERVICENOW_URLS.items():
        raw_url = url_getter()
        # AUTO_FETCH_ENABLED=false desliga QUALQUER tentativa de contactar o
        # ServiceNow (mesmo com URL configurada) — não só o scheduler
        # periódico (ver start_scheduler). Sem isto, uma chamada direta a
        # fetch_and_download_csvs() com a flag desligada ainda tentava Basic
        # Auth com SN_USER/SN_PASS, o que é exatamente o que a flag existe
        # para evitar quando SN_USER é uma conta pessoal (risco de logout
        # forçado da sessão SSO — ver config.py).
        url = raw_url if settings.AUTO_FETCH_ENABLED else None
        auto_error = None

        if url:
            try:
                logger.info("A descarregar '%s' automaticamente...", table_name)
                df = fetch_csv(url)
                dfs[table_name] = df
                # Salva uma cópia com o nome padrão pra auditoria
                df.to_csv(DOWNLOADS_DIR / f"{table_name}.csv", index=False)
                logger.info("'%s' obtido automaticamente (%d linhas).", table_name, len(df))
                continue
            except ServiceNowFetchError as exc:
                logger.error("Falha automática em '%s': %s", table_name, exc)
                auto_error = str(exc)
            except Exception as exc:  # noqa: BLE001
                logger.exception("Erro inesperado ao baixar '%s'", table_name)
                auto_error = str(exc)
        elif raw_url:
            logger.info(
                "AUTO_FETCH_ENABLED=false — a saltar a busca automática de '%s' "
                "(evita competir com a sessão SSO pessoal no ServiceNow); só tenta CSV manual.",
                table_name,
            )
        else:
            logger.warning("URL para '%s' não definida no .env — só tenta CSV manual.", table_name)

        # Tenta o CSV manual em downloads/ (qualquer nome candidato)
        candidates = filename_candidates.get(table_name, [f"{table_name}.csv"])
        manual_path = _find_manual_csv(table_name, candidates)

        if manual_path:
            try:
                age_minutes = (datetime.now().timestamp() - manual_path.stat().st_mtime) / 60
                df = _read_csv_file(manual_path, sheet_name=SHEET_NAMES.get(table_name))
                dfs[table_name] = df
                logger.warning(
                    "Usando CSV MANUAL para '%s': ficheiro '%s' "
                    "(%.0f min de idade, %d linhas). "
                    "Não é dado em tempo real.",
                    table_name, manual_path.name, age_minutes, len(df),
                )
            except ServiceNowFetchError as exc:
                errors[table_name] = f"CSV manual encontrado mas não legível: {exc}"
        else:
            searched = ", ".join(f"'{c}'" for c in candidates[:3])
            errors[table_name] = (
                (auto_error or "Sem URL configurada") +
                f" | Sem CSV manual em downloads/ (procurei: {searched})"
            )

    return dfs, errors


def _sanitize_value(v):
    """
    Converte tipos do pandas/numpy pra algo que o sqlite3 sabe bindar.
    Checa pd.isna() PRIMEIRO — cobre None/NaN/NaT tudo de uma vez. Isso
    importa porque pd.NaT (data em falta) NÃO é instância de
    pd.Timestamp, então um "isinstance(v, pd.Timestamp)" sozinho deixava
    passar NaT sem converter, e o sqlite3 rejeitava o bind com
    "type 'NaTType' is not supported" — bug real encontrado ao gravar
    'Event first occurrence' (nem todo incidente tem evento).
    """
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass  # v não é algo que pd.isna() sabe avaliar (ex: lista) — segue em frente
    if isinstance(v, pd.Timestamp):
        return v.isoformat()
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, np.floating):
        return float(v)
    if isinstance(v, np.bool_):
        return bool(v)
    return v


def _ensure_table_schema(conn: sqlite3.Connection, table_name: str, df: pd.DataFrame, key_columns: tuple[str, ...]):
    """
    Garante que a tabela existe com a PRIMARY KEY certa (key_columns) +
    colunas de controlo (_first_seen_at/_last_seen_at/_status).

    Se a tabela já existir mas com um esquema antigo (sem essa PK — como
    ficou de quando o storage era to_sql(if_exists="replace")), recria do
    zero: o conteúdo de uma tabela "replace" nunca foi histórico (era
    inteiramente substituído a cada ciclo), então não há nada de valor
    real a preservar nessa migração pontual.
    """
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,))
    exists = cur.fetchone() is not None

    if exists:
        cur.execute(f'PRAGMA table_info("{table_name}")')
        info = cur.fetchall()
        pk_cols = {row[1] for row in info if row[5] > 0}
        if pk_cols != set(key_columns):
            logger.warning(
                "Tabela '%s' existe com esquema antigo (chave primária "
                "%s, esperada %s) — recriando pro armazenamento "
                "incremental novo.",
                table_name, pk_cols or "nenhuma", key_columns,
            )
            conn.execute(f'DROP TABLE "{table_name}"')
            exists = False
        else:
            # PK bate, mas a URL pode ter ganho colunas novas (ex: SLA4_URL
            # corrigido pra incluir "SLA definition") — adiciona as que
            # faltarem em vez de recriar, preservando o histórico já
            # acumulado nas colunas antigas.
            existing_cols = {row[1] for row in info}
            missing_cols = [c for c in df.columns if c not in existing_cols]
            for col in missing_cols:
                conn.execute(f'ALTER TABLE "{table_name}" ADD COLUMN "{col}" TEXT')
            if missing_cols:
                logger.info("Tabela '%s': adicionadas colunas novas %s.", table_name, missing_cols)
                conn.commit()

    if not exists:
        other_cols = [c for c in df.columns if c not in key_columns]
        key_defs = ", ".join(f'"{c}" TEXT NOT NULL' for c in key_columns)
        other_defs = "".join(f', "{c}" TEXT' for c in other_cols)
        pk = ", ".join(f'"{c}"' for c in key_columns)
        conn.execute(f'''
            CREATE TABLE "{table_name}" (
                {key_defs}{other_defs},
                "_first_seen_at" TEXT,
                "_last_seen_at" TEXT,
                "_status" TEXT,
                PRIMARY KEY ({pk})
            )
        ''')
        conn.commit()


def _upsert_dataframe(conn: sqlite3.Connection, table_name: str, df: pd.DataFrame, key_columns: tuple[str, ...]):
    """
    UPSERT incremental: insere linhas novas, atualiza as já existentes
    (match pela chave natural) e marca "_status"='backlog' em qualquer
    linha que já estava na tabela mas não veio nesta busca — em vez de
    apagar (o ServiceNow expira/purga relatórios antigos; queremos manter
    o histórico, só sinalizado como já não sendo reportado ao vivo).

    Linhas que não vieram nesta busca e já não estavam "active" ficam
    intocadas (não voltam a ser "active" nem têm dados sobrescritos).
    """
    for col in key_columns:
        if col not in df.columns:
            raise ValueError(f"Coluna chave '{col}' não existe no dataframe de '{table_name}'.")

    df = df.dropna(subset=list(key_columns)).copy()
    for col in key_columns:
        df[col] = df[col].astype(str)

    if df.empty:
        logger.warning("'%s': nenhuma linha com chave válida pra gravar neste ciclo.", table_name)
        return

    _ensure_table_schema(conn, table_name, df, key_columns)

    data_columns = list(df.columns)
    non_key_columns = [c for c in data_columns if c not in key_columns]
    now = pd.Timestamp.now().isoformat()

    all_columns = data_columns + ["_first_seen_at", "_last_seen_at", "_status"]
    quoted_all = ", ".join(f'"{c}"' for c in all_columns)
    placeholders = ", ".join(["?"] * len(all_columns))
    conflict_cols = ", ".join(f'"{c}"' for c in key_columns)
    update_assignments = ", ".join(f'"{c}"=excluded."{c}"' for c in non_key_columns)
    set_clause = (f"{update_assignments}, " if update_assignments else "") + (
        '"_last_seen_at"=excluded."_last_seen_at", "_status"=\'active\''
    )

    sql = f'''
        INSERT INTO "{table_name}" ({quoted_all})
        VALUES ({placeholders})
        ON CONFLICT({conflict_cols}) DO UPDATE SET {set_clause}
    '''

    rows = []
    for record in df.to_dict(orient="records"):
        values = [_sanitize_value(record.get(c)) for c in data_columns]
        values += [now, now, "active"]
        rows.append(values)

    conn.executemany(sql, rows)

    # Marca como backlog quem já estava "active" na tabela mas não veio
    # nesta busca (chave não presente no lote atual).
    conn.execute('DROP TABLE IF EXISTS "_tmp_keys"')
    key_defs = ", ".join(f'"{c}" TEXT' for c in key_columns)
    conn.execute(f'CREATE TEMP TABLE "_tmp_keys" ({key_defs}, PRIMARY KEY ({conflict_cols}))')
    key_tuples = list(df[list(key_columns)].drop_duplicates().itertuples(index=False, name=None))
    conn.executemany(
        f'INSERT OR IGNORE INTO "_tmp_keys" VALUES ({", ".join(["?"] * len(key_columns))})',
        key_tuples,
    )
    exists_conds = " AND ".join(f'"_tmp_keys"."{c}" = "{table_name}"."{c}"' for c in key_columns)
    conn.execute(f'''
        UPDATE "{table_name}"
        SET "_status" = 'backlog'
        WHERE "_status" = 'active'
          AND NOT EXISTS (SELECT 1 FROM "_tmp_keys" WHERE {exists_conds})
    ''')
    conn.execute('DROP TABLE "_tmp_keys"')
    conn.commit()


def _save_justificacoes_table(conn: sqlite3.Connection, df: pd.DataFrame):
    """
    Grava a tabela de Justificações (SharePoint) por SUBSTITUIÇÃO total,
    não incremental como as outras (_upsert_dataframe): ao contrário do
    ServiceNow, esta planilha não "purga" incidentes antigos com o tempo
    — é mantida manualmente pela equipa — então não existe o conceito de
    "backlog" aqui, e nem dava pra fazer UPSERT mesmo se quiséssemos: a
    chave natural (Incidente + Aceite?) tem duplicados genuínos nos dados
    reais (o mesmo incidente com a mesma referência de SLA aparece 2x,
    aparentemente entrada duplicada na planilha de origem).

    Limpa o "Incidente" (o export tem tabs/espaços/nbsp à volta do valor
    em várias linhas) e descarta linhas sem número de incidente.
    """
    df = df.copy()
    df["Incidente"] = df["Incidente"].astype(str).str.strip()
    df = df[df["Incidente"].ne("") & df["Incidente"].str.lower().ne("nan")]
    keep_cols = [c for c in ("Incidente", "texto", "Aceite?") if c in df.columns]
    df = df[keep_cols]
    df.to_sql("justificacoes", conn, if_exists="replace", index=False)
    conn.commit()


def _save_calls_table(conn: sqlite3.Connection, df: pd.DataFrame):
    """
    Grava "Acompanhamento de Calls" (SharePoint, CALLS_URL) por
    SUBSTITUIÇÃO total — mesmo raciocínio de _save_justificacoes_table
    (planilha mantida manualmente, sem conceito de purga/backlog).
    Colunas mantidas tal como vêm (cabeçalhos com espaços/acentos, ex:
    "Id de ticket", "Data de Inicio") — quem for consumir isto faz o
    rename explícito, como o resto da app já faz pros exports brutos.
    """
    df.to_sql("calls", conn, if_exists="replace", index=False)
    conn.commit()


# Tabelas gravadas por SUBSTITUIÇÃO total (SharePoint, sem UPSERT
# incremental — ver as funções acima) em vez do padrão _upsert_dataframe.
REPLACE_TABLE_SAVERS = {
    "justificacoes": _save_justificacoes_table,
    "calls": _save_calls_table,
}


def _store_and_clean_csvs(dfs: dict) -> dict:
    """
    Grava cada DataFrame no SQLite de forma incremental (UPSERT, ver
    _upsert_dataframe) e remove o ficheiro correspondente de downloads/.
    """
    errors: dict = {}
    if not dfs:
        return errors

    filename_candidates = _build_filename_candidates()
    conn = sqlite3.connect(DB_PATH)
    try:
        for table_name, df in dfs.items():
            replace_saver = REPLACE_TABLE_SAVERS.get(table_name)
            key_columns = TABLE_KEYS.get(table_name)
            if not replace_saver and not key_columns:
                logger.warning("Sem chave definida em TABLE_KEYS pra '%s' — a saltar gravação incremental.", table_name)
                continue

            try:
                if replace_saver:
                    replace_saver(conn, df)
                else:
                    _upsert_dataframe(conn, table_name, df, key_columns)

                # Remove todos os ficheiros candidatos que existirem
                candidates = filename_candidates.get(table_name, [f"{table_name}.csv"])
                for name in candidates:
                    (DOWNLOADS_DIR / name).unlink(missing_ok=True)
                # Também remove o ficheiro padrão de auditoria se sobrou
                (DOWNLOADS_DIR / f"{table_name}.csv").unlink(missing_ok=True)

                logger.info("'%s' gravado no SQLite e ficheiros removidos de downloads/.", table_name)
            except Exception as exc:  # noqa: BLE001
                logger.exception("Erro ao salvar '%s' no SQLite", table_name)
                errors[table_name] = str(exc)
    finally:
        conn.close()

    return errors


# backlog: tabela desativada (ver _build_filename_candidates/
# SERVICENOW_URLS — sem link novo configurado ainda), então nunca aparece
# em `dfs`. Erro fixo em vez de recalcular (ver nota de otimização em
# refresh_all abaixo). "despromovidos_summary" nunca mais é escrito em
# CACHE desde 2026-08 (ver refresh_all) — o dado real agora vive em
# history_service.py/major_incs_service.py (GET /api/major-incs). O
# endpoint antigo GET /analytics/despromovidos (routers/analytics.py,
# usado só pela página legada /reports/advanced-sla) ficou sem fonte,
# devolvendo sempre 503 "cache ainda não populado" — mensagem enganosa
# (soa a falha transitória, quando na verdade é permanente). Erro fixo
# aqui só pra dar um motivo real em vez desse.
_DISABLED_TABLE_ERRORS = {
    "backlog_summary": "CSVs de backlog indisponíveis (tabela desativada, sem link configurado).",
    "despromovidos_summary": (
        "Endpoint descontinuado — Despromovidos agora é servido por GET /api/major-incs."
    ),
}


def importable_table_names() -> list[str]:
    """
    Tabelas que esta app sabe processar (mesmo conjunto de TABLE_KEYS +
    REPLACE_TABLE_SAVERS) — usado pelo seletor de tabela do upload manual
    em "Base de Dados" (ver ingest_manual_upload). Independente de a
    tabela já ter dado gravado na BD (ex: "despromovidos" pode nunca ter
    sido buscada com sucesso ainda, mas continua sendo uma tabela válida
    pra carregar à mão).
    """
    return sorted(set(TABLE_KEYS) | set(REPLACE_TABLE_SAVERS))


def importable_tables_with_download_urls() -> list[dict]:
    """
    Mesma lista de importable_table_names(), cada tabela com o link de
    download direto do ServiceNow quando existir — a MESMA URL/
    sysparm_fields já usados pela busca automática (SERVICENOW_URLS),
    pra garantir que um download manual feito por aqui traz sempre as
    colunas certas.

    RESOLVIDO (bug real, 2026-09-16): um utilizador exportou a lista de
    incidentes diretamente do ServiceNow à mão, mas a partir doutra
    vista/layout de colunas — o ficheiro não tinha "Event first
    occurrence" nem "Channel" (o PRINCIPAL_URL pede-os explicitamente no
    sysparm_fields, aquela vista não). Como o UPSERT só grava as colunas
    que vierem no ficheiro, os incidentes NOVOS trazidos por aquele
    upload entraram com esses dois campos vazios — não porque o
    ServiceNow não tivesse o dado, só porque aquele export não o pedia.
    Dar aqui o link exato (que o utilizador só tem de abrir no browser já
    autenticado e descarregar) elimina essa classe de erro à nascença.

    Tabelas do SharePoint (justificacoes/calls) não têm URL de
    ServiceNow — SERVICENOW_URLS devolve None pra elas, e o frontend
    esconde o botão de download nesse caso (têm de ser descarregadas à
    mão do SharePoint mesmo).
    """
    result = []
    for name in importable_table_names():
        url_getter = SERVICENOW_URLS.get(name)
        url = None
        if url_getter:
            try:
                url = url_getter()
            except Exception:  # noqa: BLE001
                logger.exception("Falha ao montar a URL de download de '%s'.", name)
        result.append({"table": name, "download_url": url})
    return result


def ingest_manual_upload(table_name: str, filename: str, content: bytes) -> dict:
    """
    Upload manual via UI ("Base de Dados" > Carregar Tabela Manualmente),
    pedido do utilizador: o caminho manual que já existia (colocar o
    ficheiro em downloads/ e esperar o próximo ciclo do scheduler, até
    CACHE_REFRESH_MINUTES depois) só alimentava a BD indiretamente, sem
    confirmação nenhuma pra quem carregou. Aqui o ficheiro é lido e
    gravado no SQLite NA HORA, reaproveitando exatamente o mesmo
    `_read_csv_file`/`_store_and_clean_csvs` do ciclo automático — mesmo
    tratamento de sheet/encoding/UPSERT incremental (ou substituição
    total, pras tabelas do SharePoint), zero lógica de parsing nova.

    `table_name` é revalidado contra `importable_table_names()` (defesa
    contra criar uma tabela desconhecida a partir de um nome arbitrário
    vindo do pedido). Levanta ValueError (nome inválido) ou
    ServiceNowFetchError (ficheiro ilegível ou sem as colunas esperadas
    pela tabela) — o router traduz cada um num HTTP apropriado.
    """
    known_tables = importable_table_names()
    if table_name not in known_tables:
        raise ValueError(f"Tabela '{table_name}' não é importável (válidas: {', '.join(known_tables)}).")

    suffix = Path(filename or "").suffix.lower() or ".xls"
    DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
    tmp_path = DOWNLOADS_DIR / f"_upload_{table_name}{suffix}"
    tmp_path.write_bytes(content)
    try:
        df = _read_csv_file(tmp_path, sheet_name=SHEET_NAMES.get(table_name))
    finally:
        tmp_path.unlink(missing_ok=True)

    errors = _store_and_clean_csvs({table_name: df})
    if table_name in errors:
        raise ServiceNowFetchError(errors[table_name])

    CACHE["last_updated"] = datetime.now().isoformat()
    logger.info("'%s' carregado manualmente via upload (%d linhas) e gravado no SQLite.", table_name, len(df))
    return {"table": table_name, "rows": len(df)}


def refresh_all():
    """
    RESOLVIDO (otimização 2026-08): até aqui, cada ciclo (a cada
    CACHE_REFRESH_MINUTES, default 20 min, pra sempre) também rodava
    `_compute_derived_cache()` — um pipeline COMPLETO de enrich +
    ~12 funções de métricas (kpis, priority_breakdown, tools_breakdown,
    incidents_summary, operators_summary, quality_metrics, aioper_
    summary, sem_evento_summary, sla_overview, sla3/sla4_detailed) só
    pra popular `CACHE`. Migração 2026-08 anterior já tinha movido TODOS
    os endpoints que serviam esses dados pra ler do histórico no SQLite
    (history_service.py) em vez de `CACHE` — confirmado pelos routers
    (dashboard.py, sla.py, incidents.py, operators.py, analytics.py):
    nenhum lê mais essas chaves de `CACHE`. Só `backlog_summary`/
    `despromovidos_summary` ainda liam de `CACHE` (analytics.py), e essas
    tabelas estavam desativadas (nunca vinham em `dfs`), então davam
    sempre erro mesmo assim. Ou seja: o cálculo inteiro rodava a cada
    ciclo pra ninguém — removido. Só resta o que importa de verdade:
    baixar + gravar no SQLite (fetch_and_download_csvs +
    _store_and_clean_csvs), que é o que history_service de facto lê.

    "despromovidos" foi reativada depois (2026-08, URL dinâmica — ver
    _build_despromovidos_url), mas passou a ser consumida via
    history_service.py/major_incs_service.py, não voltou pro CACHE.
    """
    logger.info("=== Iniciando ciclo de atualização do cache ===")

    dfs, download_errors = fetch_and_download_csvs()
    store_errors = _store_and_clean_csvs(dfs)

    all_errors = {**download_errors, **store_errors, **_DISABLED_TABLE_ERRORS}
    CACHE["errors"] = all_errors
    CACHE["last_updated"] = datetime.now().isoformat()

    if all_errors:
        logger.warning("Ciclo concluído com %d erro(s): %s", len(all_errors), list(all_errors.keys()))
    else:
        logger.info("Ciclo concluído sem erros. ✓")


def start_scheduler():
    """
    RESOLVIDO: antes, com AUTO_FETCH_ENABLED=false, esta função devolvia
    logo a seguir sem nunca chamar refresh_all() nem uma vez — o que
    contradizia o que config.py/README prometem ("o dashboard continua a
    funcionar via CSVs manuais em backend/downloads/"): esse caminho
    manual vive dentro de fetch_and_download_csvs(), chamada só por
    refresh_all(), então nunca corria, e ficheiros colocados em
    downloads/ eram ignorados para sempre. A proteção real contra
    contactar o ServiceNow com uma conta pessoal já está garantida dentro
    de fetch_and_download_csvs() (ver ali) — aqui o scheduler pode e deve
    correr sempre, só para detetar/gravar CSVs manuais.
    """
    if not settings.AUTO_FETCH_ENABLED:
        logger.warning(
            "AUTO_FETCH_ENABLED=false — a busca automática ao ServiceNow (Basic Auth) fica "
            "desligada (ver config.py: evita competir com a sessão SSO pessoal no browser "
            "quando SN_USER não é uma conta de serviço dedicada). O scheduler continua a "
            "correr só para detetar CSVs/Excel manuais em backend/downloads/ e gravá-los "
            "no dashboard.db — sem tocar no ServiceNow."
        )
    scheduler = BackgroundScheduler()
    scheduler.add_job(
        refresh_all, "interval",
        minutes=settings.CACHE_REFRESH_MINUTES,
        id="servicenow_sync_job",
    )
    threading.Thread(target=refresh_all, daemon=True, name="initial-refresh").start()
    scheduler.start()
    logger.info(
        "Scheduler iniciado — ciclos a cada %d min (busca automática ao ServiceNow: %s).",
        settings.CACHE_REFRESH_MINUTES,
        "ativa" if settings.AUTO_FETCH_ENABLED else "desativada, só CSVs manuais",
    )
