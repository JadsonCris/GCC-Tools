# services/turnos_service.py
"""
Gestão de Turnos MOD — ao contrário do resto da app (que só LÊ dados do
ServiceNow), este módulo é de escrita: guarda a escala de turnos da
equipa diretamente na dashboard.db, editada dentro da própria app em vez
de numa ferramenta HTML/localStorage à parte (ver backend/data/
turnos_seed.json — export real dessa ferramenta antiga, usado como
dados iniciais).

Modelo relacional (2 tabelas, diferente do padrão UPSERT do resto do
cache.py porque isto não vem de um export externo — é a própria app que
escreve):
  turnos_employees(id, name, pos, hidden, sort_order)
  turnos_shifts(employee_id, date, shift)  — PK composta, 1 linha por
    dia com turno atribuído (dias sem turno simplesmente não têm linha,
    igual ao "monthly" esparso da ferramenta original).

Códigos de turno (iguais aos da ferramenta original):
  M=Manhã, T=Tarde, N=Noite, I=Intermédio, F=Férias, A=Falta, H=Feriado
"""
import json
import sqlite3
from pathlib import Path

from cache import DB_PATH

BASE_DIR = Path(__file__).resolve().parent.parent
SEED_PATH = BASE_DIR / "data" / "turnos_seed.json"

VALID_SHIFTS = {"M", "T", "N", "I", "F", "A", "H"}


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def ensure_schema():
    conn = _connect()
    try:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS turnos_employees (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                pos TEXT NOT NULL DEFAULT 'MOD',
                hidden INTEGER NOT NULL DEFAULT 0,
                sort_order INTEGER NOT NULL DEFAULT 0
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS turnos_shifts (
                employee_id INTEGER NOT NULL REFERENCES turnos_employees(id) ON DELETE CASCADE,
                date TEXT NOT NULL,
                shift TEXT NOT NULL,
                PRIMARY KEY (employee_id, date)
            )
        ''')
        conn.commit()
    finally:
        conn.close()


def seed_if_empty():
    """
    Importa backend/data/turnos_seed.json (export real da ferramenta
    HTML antiga) só se "turnos_employees" ainda estiver vazia — chamado
    uma vez no arranque da app (ver main.py). Idempotente: se já houver
    colaboradores gravados (equipa já mexeu na app nova), não faz nada,
    pra nunca sobrescrever trabalho real com os dados de seed.
    """
    ensure_schema()
    conn = _connect()
    try:
        count = conn.execute("SELECT COUNT(*) FROM turnos_employees").fetchone()[0]
        if count > 0:
            return
        if not SEED_PATH.exists():
            return

        with open(SEED_PATH, encoding="utf-8") as f:
            data = json.load(f)

        for order, emp in enumerate(data.get("employees", [])):
            cur = conn.execute(
                "INSERT INTO turnos_employees (name, pos, hidden, sort_order) VALUES (?, ?, ?, ?)",
                (emp["name"], emp.get("pos", "MOD"), 1 if emp.get("hidden") else 0, order),
            )
            employee_id = cur.lastrowid

            rows = []
            for month_key, days in emp.get("monthly", {}).items():
                year_str, month0_str = month_key.split("-")
                year, month0 = int(year_str), int(month0_str)
                for day_str, shift in days.items():
                    if shift not in VALID_SHIFTS:
                        continue
                    date = f"{year:04d}-{month0 + 1:02d}-{int(day_str):02d}"
                    rows.append((employee_id, date, shift))
            if rows:
                conn.executemany(
                    "INSERT OR REPLACE INTO turnos_shifts (employee_id, date, shift) VALUES (?, ?, ?)",
                    rows,
                )
        conn.commit()
    finally:
        conn.close()


def list_employees() -> list[dict]:
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT id, name, pos, hidden, sort_order FROM turnos_employees ORDER BY sort_order, id"
        ).fetchall()
        return [
            {"id": r[0], "name": r[1], "pos": r[2], "hidden": bool(r[3]), "sort_order": r[4]}
            for r in rows
        ]
    finally:
        conn.close()


def create_employee(name: str, pos: str = "MOD") -> dict:
    conn = _connect()
    try:
        max_order = conn.execute("SELECT COALESCE(MAX(sort_order), -1) FROM turnos_employees").fetchone()[0]
        cur = conn.execute(
            "INSERT INTO turnos_employees (name, pos, hidden, sort_order) VALUES (?, ?, 0, ?)",
            (name.strip(), (pos or "MOD").strip(), max_order + 1),
        )
        conn.commit()
        return {"id": cur.lastrowid, "name": name.strip(), "pos": pos or "MOD", "hidden": False, "sort_order": max_order + 1}
    finally:
        conn.close()


def update_employee(employee_id: int, *, name: str | None = None, pos: str | None = None, hidden: bool | None = None) -> None:
    fields, values = [], []
    if name is not None:
        fields.append("name = ?")
        values.append(name.strip())
    if pos is not None:
        fields.append("pos = ?")
        values.append(pos.strip())
    if hidden is not None:
        fields.append("hidden = ?")
        values.append(1 if hidden else 0)
    if not fields:
        return
    values.append(employee_id)

    conn = _connect()
    try:
        conn.execute(f"UPDATE turnos_employees SET {', '.join(fields)} WHERE id = ?", values)
        conn.commit()
    finally:
        conn.close()


def delete_employee(employee_id: int) -> None:
    conn = _connect()
    try:
        conn.execute("DELETE FROM turnos_employees WHERE id = ?", (employee_id,))
        conn.commit()
    finally:
        conn.close()


def get_shifts_for_year(year: int) -> dict[str, dict[str, str]]:
    """{employee_id (str): {"YYYY-MM-DD": shift}} — o ano inteiro de uma vez
    (usado pelas estatísticas anuais/individuais, que precisam do ano todo)."""
    conn = _connect()
    try:
        rows = conn.execute(
            "SELECT employee_id, date, shift FROM turnos_shifts WHERE date >= ? AND date < ?",
            (f"{year:04d}-01-01", f"{year + 1:04d}-01-01"),
        ).fetchall()
    finally:
        conn.close()

    result: dict[str, dict[str, str]] = {}
    for employee_id, date, shift in rows:
        result.setdefault(str(employee_id), {})[date] = shift
    return result


def save_month_shifts(employee_id: int, year: int, month: int, days: dict[str, str]) -> None:
    """
    Substitui TODOS os turnos desse colaborador nesse mês pelos `days`
    recebidos ({"1": "M", "2": "", ...} — dia do mês 1-31, string vazia
    apaga o turno desse dia). `month` é 1-indexado (Janeiro=1).
    """
    conn = _connect()
    try:
        start = f"{year:04d}-{month:02d}-01"
        next_month = month + 1
        next_year = year
        if next_month > 12:
            next_month = 1
            next_year += 1
        end = f"{next_year:04d}-{next_month:02d}-01"

        conn.execute(
            "DELETE FROM turnos_shifts WHERE employee_id = ? AND date >= ? AND date < ?",
            (employee_id, start, end),
        )
        rows = [
            (employee_id, f"{year:04d}-{month:02d}-{int(day):02d}", shift)
            for day, shift in days.items()
            if shift in VALID_SHIFTS
        ]
        if rows:
            conn.executemany(
                "INSERT INTO turnos_shifts (employee_id, date, shift) VALUES (?, ?, ?)",
                rows,
            )
        conn.commit()
    finally:
        conn.close()


def clear_month(year: int, month: int) -> None:
    """Apaga os turnos de TODOS os colaboradores nesse mês — "Limpar Mês"."""
    start = f"{year:04d}-{month:02d}-01"
    next_month, next_year = (1, year + 1) if month == 12 else (month + 1, year)
    end = f"{next_year:04d}-{next_month:02d}-01"

    conn = _connect()
    try:
        conn.execute("DELETE FROM turnos_shifts WHERE date >= ? AND date < ?", (start, end))
        conn.commit()
    finally:
        conn.close()
