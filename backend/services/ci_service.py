# services/ci_service.py
"""
Interpreta a tabela bruta de CI's (Configuration Items associados a
incidentes, task_ci_list.do — ver cache.py, CI_URL). Cada linha liga uma
task (normalmente um incidente do GCC) a um CI que lhe foi anexado, e
regista quem o fez e quando — usado como 3º indicador (a par de
Abertos/Resolvidos) na Atividade Operacional e na view "CI's em INCs do
AIOPS" (quem coloca CI's nos incidentes abertos automaticamente pelo bot).

CONFIRMADO no primeiro fetch real (backend/downloads/CI_URL.xls, 17156
linhas): cabeçalhos reais são "Task", "Configuration Item", "Class",
"Created by", "Created" — só "Configuration Item" (I maiúsculo) diferiu
da estimativa inicial a partir do sysparm_fields ("Configuration item",
i minúsculo); "sys_update_on" pedido no sysparm_fields não veio no
export (não é usado por este módulo). resolver_coluna() (busca
tolerante, case-insensitive, por conter em vez de igualdade estrita)
absorve essa e outras pequenas variações de rótulo sem precisar de
código novo; se faltar mesmo a coluna essencial (task/created by/created
on), devolve tabela vazia em vez de rebentar.
"""
import re

import pandas as pd

from services import team_service

_INC_PATTERN = re.compile(r"(INC\d+)")

_EMPTY_COLUMNS = ["incidente", "ci_item", "ci_class", "tecnico", "created_at", "is_aiops_self"]


def resolver_coluna(colunas: list[str], candidatos: list[str]) -> str | None:
    """Busca tolerante (case-insensitive, por conter) — mesma lógica de
    ponto_situacao_service.resolver_coluna, duplicada aqui de propósito:
    são dois serviços sem relação nenhuma entre si, não vale a pena criar
    uma dependência cruzada só por causa de 10 linhas."""
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


def prepare_ci_rows(df_raw: pd.DataFrame | None) -> pd.DataFrame:
    """
    Normaliza a tabela bruta de CI's: extrai o número do incidente (regex
    INC\\d+ sobre a coluna "task"), resolve "sys_created_by" (username
    curto do ServiceNow, ex: "EX132427") pro nome completo via
    team_service (mesma convenção já usada pra "ok_"), e marca
    is_aiops_self quando foi o próprio bot AIOPS a colocar o CI. Devolve
    um DataFrame vazio (mesmas colunas) se a tabela não existir ou faltar
    alguma coluna essencial.
    """
    empty = pd.DataFrame(columns=_EMPTY_COLUMNS)
    if df_raw is None or df_raw.empty:
        return empty

    cols = list(df_raw.columns)
    col_task = resolver_coluna(cols, ["task"])
    col_ci = resolver_coluna(cols, ["configuration item", "ci_item", "ci item"])
    col_class = resolver_coluna(cols, ["configuration item.class", "sys_class_name", "class name", "class"])
    col_by = resolver_coluna(cols, ["created by", "sys_created_by"])
    col_on = resolver_coluna(cols, ["created", "sys_created_on"])
    if not col_task or not col_by or not col_on:
        return empty

    incidente = df_raw[col_task].astype(str).str.extract(_INC_PATTERN, expand=False)
    username = df_raw[col_by].astype(str).str.strip()
    bots_upper = {b.upper() for b in team_service.bot_usernames()}
    is_aiops = username.str.upper().isin(bots_upper)
    # username_to_tecnico já sabe devolver o nome do bot sem sufixo
    # " Claranet" (ver team_service.py) — is_aiops fica só pra marcar
    # is_aiops_self abaixo.
    tecnico = username.apply(team_service.username_to_tecnico)

    out = pd.DataFrame({
        "incidente": incidente,
        "ci_item": df_raw[col_ci].astype(str).str.strip() if col_ci else "",
        "ci_class": df_raw[col_class].astype(str).str.strip() if col_class else "",
        "tecnico": tecnico,
        "created_at": pd.to_datetime(df_raw[col_on], errors="coerce"),
        "is_aiops_self": is_aiops,
    })
    return out[out["incidente"].notna()]


def filter_ci_by_incident_set(df_ci: pd.DataFrame | None, incident_numbers: set[str]) -> pd.DataFrame | None:
    """
    Restringe as linhas de CI's aos incidentes que já sobreviveram ao
    filtro de período+região+técnicos ocultos+cancelados do principal —
    mesmo raciocínio de team_service.filter_ok_by_incident_set (a tabela
    de CI's, tal como "ok_", não tem região/técnico-oculto próprios).
    """
    if df_ci is None or df_ci.empty:
        return df_ci
    return df_ci[df_ci["incidente"].isin(incident_numbers)]


def get_ci_on_aiops_incidents(
    enriched_principal: pd.DataFrame | None, df_ci: pd.DataFrame | None, hidden: set[str] | None = None
) -> dict:
    """
    Cruza os incidentes abertos pelo AIOPS (Grupo == "AIOPER" em
    gcc_abertos já enriquecido, ver transform.add_grupo_column) com a
    tabela de CI's — ranking de quem colocou CI's nesses incidentes, útil
    pra medir quem "limpa atrás" do bot em vez de ser o próprio AIOPS a
    fazê-lo. Devolve SEMPRE o ranking completo (inclui a linha "AIOPS" se
    o bot também colocou CI's a si próprio) — o seletor "Excluir CI's do
    próprio AIOPS" do protótipo é só um filtro visual no frontend (a
    linha "AIOPS" já vem identificável, não precisa de round-trip ao
    backend pra alternar).
    """
    empty = {"total_incidentes_aiops": 0, "total_cis": 0, "ranking": [], "por_mes": []}
    if enriched_principal is None or enriched_principal.empty:
        return empty

    aiops_incidentes = set(
        enriched_principal.loc[enriched_principal["Grupo"] == "AIOPER", "Incidente"].dropna().astype(str)
    )
    if not aiops_incidentes:
        return empty
    # Reporta sempre o total de incidentes do AIOPS, mesmo sem dados de
    # CI's ainda (tabela "cis" vazia/inexistente) — só o resto fica a 0.
    if df_ci is None or df_ci.empty:
        return {**empty, "total_incidentes_aiops": len(aiops_incidentes)}

    rows = df_ci[df_ci["incidente"].isin(aiops_incidentes)]
    if hidden:
        rows = rows[~rows["tecnico"].isin(hidden)]
    if rows.empty:
        return {**empty, "total_incidentes_aiops": len(aiops_incidentes)}

    ranking = (
        rows.groupby("tecnico")
        .agg(cis=("incidente", "size"), incidentes=("incidente", "nunique"))
        .reset_index()
        .sort_values("cis", ascending=False)
    )
    por_mes = (
        rows.assign(mes=rows["created_at"].dt.strftime("%Y-%m"))
        .groupby("mes").size().reset_index(name="cis").sort_values("mes")
    )

    return {
        "total_incidentes_aiops": len(aiops_incidentes),
        "total_cis": int(len(rows)),
        "ranking": [
            {"tecnico": r["tecnico"], "cis": int(r["cis"]), "incidentes": int(r["incidentes"])}
            for r in ranking.to_dict(orient="records")
        ],
        "por_mes": [{"mes": r["mes"], "cis": int(r["cis"])} for r in por_mes.to_dict(orient="records")],
    }
