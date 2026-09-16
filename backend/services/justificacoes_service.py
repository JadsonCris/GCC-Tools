# services/justificacoes_service.py
"""
Interpreta a tabela bruta de Justificações (SharePoint, JUSTIFICACOES_URL
— ver cache.py) — schema real confirmado abrindo
backend/downloads/JUSTIFICACOES_URL.xlsm, sheet "Justificações":

  Incidente | texto | Aceite?

"Aceite?" diz quais SLAs aquela linha justifica pro incidente. Valores
reais encontrados na planilha: "SLA1", "SLA2", "SLA3", "SLA4", "SLA1,
SLA2" (várias, separadas por vírgula) e "Despromoção" — mapeado pra
SLA4, o mesmo conceito de "P1 despromovido" que o SLA4 desta app já usa
(ver sla_service.py). Linhas com "Aceite?" vazio (ainda não avaliadas
pela equipa) NÃO contam como justificadas.

Um mesmo incidente pode aparecer em várias linhas — uma por SLA/motivo
diferente (confirmado nos dados reais, ex: INC3311534 tem uma linha
"SLA3" e outra "Despromoção", com textos diferentes). A tabela bruta
também tem duplicados genuínos (mesmo Incidente + mesmo Aceite? duas
vezes) — ver ASSUNÇÃO em cache._save_justificacoes_table.
"""
import re

import pandas as pd

_SLA_PATTERN = re.compile(r"SLA\s*([1-4])", re.IGNORECASE)


def _extract_slas(aceite) -> set[int]:
    if aceite is None or (isinstance(aceite, float) and pd.isna(aceite)):
        return set()
    text = str(aceite)
    slas = {int(n) for n in _SLA_PATTERN.findall(text)}
    if "despromo" in text.lower():
        slas.add(4)
    return slas


def parse_justificacoes(df: pd.DataFrame | None) -> pd.DataFrame:
    """
    Normaliza a tabela bruta: limpa "Incidente" (tabs/espaços/nbsp) e
    adiciona a coluna interna "_slas" (set de ints 1-4) com quais SLAs
    cada linha justifica. Descarta linhas sem incidente ou sem nenhum
    SLA reconhecido em "Aceite?" (inclui as ainda não avaliadas).
    """
    if df is None or df.empty or "Incidente" not in df.columns:
        return pd.DataFrame(columns=["Incidente", "texto", "Aceite?", "_slas"])

    df = df.copy()
    df["Incidente"] = df["Incidente"].astype(str).str.strip()
    df = df[df["Incidente"].ne("") & df["Incidente"].str.lower().ne("nan")]
    df["_slas"] = df.get("Aceite?", pd.Series(dtype=str)).apply(_extract_slas)
    return df[df["_slas"].apply(len) > 0]


def _join_unique_texts(texts) -> str:
    """Junta os textos de um mesmo incidente na ordem em que aparecem,
    pulando vazios e qualquer texto que já esteja contido (substring) no
    que já foi juntado até aqui — mesma regra de sempre, só extraída pra
    ser reaproveitada pelo groupby de get_justified_map."""
    result = None
    for t in texts:
        if result is None:
            result = t
        elif t and t not in result:
            result = f"{result} | {t}"
    return result if result is not None else ""


def get_justified_map(df_parsed: pd.DataFrame, sla: int) -> dict[str, str]:
    """
    Incidente (limpo) -> texto da justificação, só pra quem justifica o
    SLA pedido (1-4). Se o mesmo incidente tiver mais de uma linha pro
    mesmo SLA (dados de origem duplicados/múltiplos motivos), junta os
    textos com " | ".

    RESOLVIDO (otimização 2026-09-16): usava `.iterrows()` (loop Python
    linha a linha, lento em pandas) pra montar o dict — trocado por
    `groupby("Incidente").agg(_join_unique_texts)` (mesma junção, mesma
    ordem dentro de cada grupo, validado com diff de dict contra a versão
    antiga nos 4 SLAs com dados reais).
    """
    if df_parsed is None or df_parsed.empty:
        return {}
    subset = df_parsed[df_parsed["_slas"].apply(lambda s: sla in s)]
    if subset.empty:
        return {}
    texto = subset.get("texto", pd.Series(dtype=str)).apply(lambda v: str(v or "").strip())
    subset = subset.assign(_texto=texto)
    return subset.groupby("Incidente")["_texto"].agg(_join_unique_texts).to_dict()
