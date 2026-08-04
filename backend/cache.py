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
from services import dashboard_service, incidents_service, operators_service, sla_service
from services.servicenow_client import ServiceNowFetchError, _parse_csv_text, fetch_csv
from services.transform import enrich_sys_report_template, exclude_hidden_technicians, exclude_canceled_incidents

logger = logging.getLogger("cache")

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "dashboard.db"
DOWNLOADS_DIR = BASE_DIR / "downloads"

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
        "tag_calls_gcc": [
            settings.SN_FILENAME_TAG_CALLS_GCC,
            "TAG_CALLS_GCC_URL.xls",
            "tag_calls_gcc.xls",
        ],
        # SharePoint (.xlsm), não ServiceNow — só via download manual (ver
        # SERVICENOW_URLS abaixo, sem URL de busca automática).
        "justificacoes": [
            settings.SN_FILENAME_JUSTIFICACOES,
            "JUSTIFICACOES_URL.xlsm",
            "justificacoes.xlsm",
        ],
        # Desativadas por agora (ver .env / config.py) — sem link novo ainda.
        # "sla3_grupos": [settings.SN_FILENAME_SLA3_GRUPOS, "sla3_grupos.csv"],
        # "users": [settings.SN_FILENAME_USERS, "users.csv"],
        # "auditkeys": [settings.SN_FILENAME_AUDITKEYS, "auditkeys.csv"],
        # "despromovidos": [settings.SN_FILENAME_DESPROMOVIDOS, "despromovidos.csv"],
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
    "tag_calls_gcc": lambda: settings.TAG_CALLS_GCC_URL,
    # Sempre None: JUSTIFICACOES_URL é SharePoint, não ServiceNow — a auth
    # de SN_USER/SN_PASS não serve pra isso, então nem tenta a busca
    # automática (iria só devolver a página de login em HTML). Cai direto
    # pro download manual em downloads/ (ver fetch_and_download_csvs).
    "justificacoes": lambda: None,
    # Desativadas por agora (ver .env / config.py) — sem link novo ainda.
    # "sla3_grupos": lambda: settings.SLA3_GROUPS_URL,
    # "users": lambda: settings.USERS_URL,
    # "auditkeys": lambda: settings.AUDITKEYS_URL,
    # "despromovidos": lambda: settings.DESPROMOVIDOS_URL,
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
    "tag_calls_gcc": ("Title",),
}

CACHE: dict = {"errors": {}, "last_updated": None}


# Algumas tabelas manuais (ex: "justificacoes", um .xlsm do SharePoint
# com várias sheets) precisam de uma sheet específica em vez da primeira
# — ver _read_csv_file(sheet_name=...) e fetch_and_download_csvs().
SHEET_NAMES: dict[str, str] = {
    "justificacoes": "Justificações",
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
        url = url_getter()
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
            is_replace_table = table_name == "justificacoes"
            key_columns = TABLE_KEYS.get(table_name)
            if not is_replace_table and not key_columns:
                logger.warning("Sem chave definida em TABLE_KEYS pra '%s' — a saltar gravação incremental.", table_name)
                continue

            try:
                if is_replace_table:
                    _save_justificacoes_table(conn, df)
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


def _compute_derived_cache(dfs: dict) -> tuple[dict, dict]:
    result: dict = {}
    errors: dict = {}

    raw_principal = dfs.get("gcc_abertos")
    if raw_principal is not None:
        # Exclui técnicos ocultos (ver HIDDEN_TECNICOS em transform.py) já
        # aqui, pois raw_principal também é usado como conjunto de
        # cruzamento do SLA3 mais abaixo — não só dentro do enrich().
        raw_principal = exclude_hidden_technicians(raw_principal, column="Opened by")
        raw_principal = exclude_canceled_incidents(raw_principal, column="State")
    principal_keys = (
        "kpis", "priority_breakdown", "tools_breakdown",
        "incidents_summary", "operators_summary", "quality_metrics",
        "aioper_summary", "sem_evento_summary",
    )
    sla1_sla2 = None
    if raw_principal is not None:
        try:
            enriched = enrich_sys_report_template(raw_principal)
            # Guardado pra permitir filtrar por operador sob demanda (ver
            # routers/operators.py -> GET /api/operators/{tecnico}), sem
            # precisar rebaixar/re-fetch a cada clique no frontend.
            result["_enriched_principal"] = enriched
            result["kpis"] = dashboard_service.get_kpis(enriched)
            result["priority_breakdown"] = dashboard_service.get_priority_breakdown(enriched)
            result["tools_breakdown"] = dashboard_service.get_tools_breakdown(enriched)
            result["incidents_summary"] = incidents_service.get_incidents_summary(enriched)
            result["operators_summary"] = operators_service.get_operators_summary(enriched)
            result["aioper_summary"] = dashboard_service.get_aioper_summary(enriched)
            sla1_sla2 = dashboard_service.get_sla1_sla2(enriched)
            from services import quality_service
            result["quality_metrics"] = quality_service.get_quality_metrics(enriched)
            result["sem_evento_summary"] = quality_service.get_sem_evento_breakdown(enriched)
        except Exception as exc:  # noqa: BLE001
            msg = f"Falha ao calcular métricas: {type(exc).__name__}: {exc}"
            logger.exception(msg)
            for key in principal_keys:
                errors[key] = msg
    else:
        msg = "CSV 'gcc_abertos' indisponível neste ciclo."
        for key in principal_keys:
            errors[key] = msg

    raw_sla3 = dfs.get("sla3_incidentes")
    if raw_sla3 is not None:
        raw_sla3 = exclude_hidden_technicians(raw_sla3, column="Opened by")
        raw_sla3 = exclude_canceled_incidents(raw_sla3, column="State")
    raw_sla4 = dfs.get("sla4")
    sla_keys = ("sla_overview", "sla3_detailed", "sla4_detailed")
    if raw_sla3 is not None and raw_sla4 is not None and raw_principal is not None:
        try:
            sla3_sla4 = sla_service.get_sla_overview(raw_sla3, raw_sla4, raw_principal)
            default_sla1 = {"avg_seconds": 0, "avg_time": "00:00:00", "target_minutes": 15}
            default_sla2 = {"pct": 0.0, "target": 90}
            result["sla_overview"] = {
                "sla1": (sla1_sla2 or {}).get("sla1", default_sla1),
                "sla2": (sla1_sla2 or {}).get("sla2", default_sla2),
                "sla3": sla3_sla4["sla3"],
                "sla4": sla3_sla4["sla4"],
            }
            result["sla3_detailed"] = result["sla_overview"]["sla3"]
            result["sla4_detailed"] = result["sla_overview"]["sla4"]
        except Exception as exc:  # noqa: BLE001
            msg = f"Falha ao calcular SLA3/SLA4: {type(exc).__name__}: {exc}"
            logger.exception(msg)
            for key in sla_keys:
                errors[key] = msg
    else:
        missing = [n for n, d in (("sla3_incidentes", raw_sla3), ("sla4", raw_sla4), ("gcc_abertos", raw_principal)) if d is None]
        for key in sla_keys:
            errors[key] = f"CSVs indisponíveis: {', '.join(missing)}"

    raw_backlog_inc = dfs.get("mon_backlog_incs")
    raw_backlog_ritm = dfs.get("mon_backlog_ritm")
    if raw_backlog_inc is not None or raw_backlog_ritm is not None:
        try:
            from services import backlog_service
            result["backlog_summary"] = backlog_service.get_backlog_summary(raw_backlog_inc, raw_backlog_ritm)
        except Exception as exc:  # noqa: BLE001
            errors["backlog_summary"] = f"Erro no cálculo de Backlog: {exc}"
    else:
        errors["backlog_summary"] = "CSVs de backlog indisponíveis."

    raw_despromovidos = dfs.get("despromovidos")
    if raw_despromovidos is not None:
        try:
            from services import audit_service
            result["despromovidos_summary"] = audit_service.get_despromovidos_metrics(raw_despromovidos)
        except Exception as exc:  # noqa: BLE001
            errors["despromovidos_summary"] = f"Erro em Despromovidos: {exc}"
    else:
        errors["despromovidos_summary"] = "CSV 'despromovidos' indisponível."

    return result, errors


def refresh_all():
    logger.info("=== Iniciando ciclo de atualização do cache ===")

    dfs, download_errors = fetch_and_download_csvs()
    store_errors = _store_and_clean_csvs(dfs)
    derived, compute_errors = _compute_derived_cache(dfs)

    all_errors = {**download_errors, **store_errors, **compute_errors}
    CACHE.update(derived)
    CACHE["errors"] = all_errors
    CACHE["last_updated"] = datetime.now().isoformat()

    if all_errors:
        logger.warning("Ciclo concluído com %d erro(s): %s", len(all_errors), list(all_errors.keys()))
    else:
        logger.info("Ciclo concluído sem erros. ✓")


def start_scheduler():
    scheduler = BackgroundScheduler()
    scheduler.add_job(
        refresh_all, "interval",
        minutes=settings.CACHE_REFRESH_MINUTES,
        id="servicenow_sync_job",
    )
    threading.Thread(target=refresh_all, daemon=True, name="initial-refresh").start()
    scheduler.start()
    logger.info("Scheduler iniciado — ciclos a cada %d min.", settings.CACHE_REFRESH_MINUTES)
