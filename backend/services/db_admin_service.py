# services/db_admin_service.py
"""
Inspeção genérica das tabelas da dashboard.db — pedido do utilizador:
"controlo sem ter de ir ao servidor/BD". Lista as tabelas reais
existentes e devolve o conteúdo paginado de qualquer uma delas, sem
precisar de saber SQL. Usado pela view "Base de Dados" (abaixo de
"Gestão de Turnos" na sidebar). Só leitura — não há nenhum endpoint de
escrita aqui.
"""
import sqlite3

from cache import DB_PATH

# Tabela interna do próprio SQLite (bookkeeping de colunas AUTOINCREMENT)
# — não é dado da app, não faz sentido aparecer nesta lista.
_INTERNAL_TABLES = {"sqlite_sequence"}


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _real_table_names(conn: sqlite3.Connection) -> set[str]:
    return {
        r["name"] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    }


def list_tables() -> list[dict]:
    """Nome + nº de linhas de cada tabela real da BD (exclui tabelas internas do SQLite)."""
    conn = _connect()
    try:
        names = sorted(_real_table_names(conn) - _INTERNAL_TABLES)
        return [
            {"name": name, "row_count": conn.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0]}
            for name in names
        ]
    finally:
        conn.close()


def get_table_data(
    table: str, limit: int = 100, offset: int = 0,
    order_by: str | None = None, order_dir: str = "asc",
) -> dict:
    """
    Conteúdo paginado de UMA tabela. `table` é revalidado aqui contra
    sqlite_master (defesa em profundidade — nunca monta SQL com um nome
    de tabela que não seja um nome real confirmado na BD, mesmo que o
    router já valide isto também).

    `order_by` (opcional): ordena no SERVIDOR, sobre a tabela INTEIRA —
    não só a página atual (o frontend só tem as `limit` linhas de uma
    página de cada vez, então um sort local nunca poderia ver o resto).
    Revalidado contra `PRAGMA table_info` da própria tabela, pelo mesmo
    motivo do nome da tabela (nome de coluna também não pode ser
    parametrizado em SQLite, só concatenado depois de confirmado real).
    """
    conn = _connect()
    try:
        if table in _INTERNAL_TABLES or table not in _real_table_names(conn):
            raise ValueError(f"Tabela '{table}' não existe.")

        columns = [r["name"] for r in conn.execute(f'PRAGMA table_info("{table}")').fetchall()]

        order_clause = ""
        if order_by is not None:
            if order_by not in columns:
                raise ValueError(f"Coluna '{order_by}' não existe em '{table}'.")
            direction = "DESC" if str(order_dir).lower() == "desc" else "ASC"
            order_clause = f' ORDER BY "{order_by}" {direction}'

        total = conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
        rows = conn.execute(
            f'SELECT * FROM "{table}"{order_clause} LIMIT ? OFFSET ?', (limit, offset)
        ).fetchall()
        if rows:
            columns = list(rows[0].keys())
        return {
            "table": table,
            "columns": columns,
            "rows": [dict(r) for r in rows],
            "total": total,
            "limit": limit,
            "offset": offset,
        }
    finally:
        conn.close()
