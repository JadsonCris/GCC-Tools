// utils/reportsCab.js
// Cruzamento Outage x Changes do CAB (colunas de nomes variáveis
// consoante a exportação: `Planned start date` vs `Unavailability Start
// Date` pras entradas manuais, `Task number` vs `Number.1` no Outage) —
// porta verbatim da lógica client-side da ferramenta standalone. Não
// existe endpoint de backend equivalente ativo (havia um em Flask,
// nunca chamado pelo frontend original — não foi portado, ver plano).
import { parseDateSN } from "./reportsDate";

function findColByRegex(cols, regex, fallback) {
  return cols.find((c) => regex.test(c)) || fallback;
}

// Filtra os Changes cuja janela [início,fim] tem sobreposição com
// [windowStart, windowEnd], e cruza-os com os números de Change
// referenciados no Outage (Task number / Number.1 / etc.) — devolve só
// os que aparecem nos dois lados.
export function crossReferenceCabOutage(outageRows, changesRows, { start: windowStart, end: windowEnd }) {
  const colsChg = changesRows.length ? Object.keys(changesRows[0]) : [];
  const colChgInicio = findColByRegex(colsChg, /start|begin/i, "Planned start date");
  const colChgFim = findColByRegex(colsChg, /end/i, "Planned end date");
  const colChgNum = findColByRegex(colsChg, /^number$/i, "Number");

  const changesFiltrados = changesRows.filter((row) => {
    const ini = parseDateSN(row[colChgInicio]);
    const fim = parseDateSN(row[colChgFim]);
    if (!ini && !fim) return false;
    const chgIni = ini || fim;
    const chgFim = fim || ini;
    return chgFim >= windowStart && chgIni <= windowEnd;
  });

  const colsOut = outageRows.length ? Object.keys(outageRows[0]) : [];
  const outageChgCols = colsOut.filter(
    (c) => /task[_ ]number/i.test(c) || /number[._]1/i.test(c) || /task_number\.parent\.number/i.test(c) || /chg/i.test(c)
  );

  function getOutageChg(row) {
    for (const col of outageChgCols) {
      const val = String(row[col] || "").trim();
      if (val) return val;
    }
    return String(
      row["Task number"] || row["Task number "] || row["Number.1"] || row["Number_1"] ||
      row["task_number.parent.number"] || row["task_number.parent.number "] || ""
    ).trim();
  }

  const outageNumbers = new Set(outageRows.map(getOutageChg).filter(Boolean).map((n) => n.toLowerCase()));

  const resultado = changesFiltrados.filter((row) => {
    const chgNum = String(row[colChgNum] || "").trim().toLowerCase();
    return chgNum && outageNumbers.has(chgNum);
  });

  return { changesFiltrados, resultado };
}
