# services/team_service.py
"""
Mapa Utilizador (username curto do ServiceNow, ex: "EX132427") -> Nome
completo da equipa — passado diretamente pelo utilizador (não vem em
nenhum export automatizado). Usado pra traduzir a coluna "Created by" da
tabela "ok_" (TAG OK — ver cache.py, OK_URL) pro mesmo formato de nome
usado em "Opened by"/"Técnico" no resto da app ("{Nome} Claranet").
"""
import re

import pandas as pd

USUARIOS: dict[str, str] = {
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

_INC_PATTERN = re.compile(r"(INC\d+)")


def username_to_tecnico(username) -> str:
    """"EX132427" -> "André Fernandes Claranet" (mesmo formato de "Opened by").
    Username sem mapa conhecido é devolvido tal como veio, pra não perder o dado."""
    nome = USUARIOS.get(str(username).strip())
    return f"{nome} Claranet" if nome else str(username)


def get_team_activity(df_principal_enriched: pd.DataFrame, df_ok_raw: pd.DataFrame | None) -> list[dict]:
    """
    Por técnico: nº de incidentes abertos (coluna "Técnico" do principal
    já enriquecido/filtrado) + nº de tags "OK_GCC" feitas (tabela "ok_",
    coluna "Created by" — username curto, traduzido via USUARIOS acima).

    `df_ok_raw` já deve vir filtrado pelo chamador (ver history_service)
    pros mesmos incidentes do período/região selecionados — faz isso
    cruzando o número extraído de "Title" ("Incident - INC0030238") com
    o conjunto de incidentes do `df_principal_enriched`, já que a tabela
    "ok_" não tem campo de região próprio.
    """
    opened = df_principal_enriched.groupby("Técnico").size()

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
