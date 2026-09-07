// utils/reportsDate.js
// Parsing/filtro de datas dos exports do ServiceNow — porta verbatim da
// ferramenta standalone. Duas direções de janela distintas (ver
// [[compiled-conjuring-umbrella]] no plano): Ibéria/Brasil olham pra
// TRÁS a partir de agora; CAB olha pra FRENTE a partir de hoje 18h.

const COLUNAS_DATA = ["Opened", "opened_at", "Created", "sys_created_on", "Criado", "Data"];

// Deteta a coluna de data: primeiro tenta correspondência exata (evita
// apanhar colunas como "Opened by", que contém "opened" mas não é data).
export function encontrarColunaData(cols) {
  const exatos = COLUNAS_DATA.map((x) => x.toLowerCase());
  return (
    cols.find((c) => exatos.includes(c.trim().toLowerCase())) ||
    cols.find((c) => {
      const clean = c.trim().toLowerCase();
      return (clean.includes("opened") && !clean.includes("by")) || clean.includes("criado");
    }) ||
    null
  );
}

// Parseia o valor de data tal como vem do export (Date do SheetJS, serial
// do Excel, ISO "yyyy-mm-dd HH:MM(:SS)?", PT "dd-mm-yyyy"/"dd/mm/yyyy" —
// devolve null se não reconhecer nenhum formato.
export function parseDateSN(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val) ? null : val;

  if (typeof val === "number") {
    return new Date(Math.round((val - (25567 + 2)) * 86400 * 1000));
  }

  const s = String(val).trim();

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));

  m = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0));

  const d = new Date(s);
  return isNaN(d) ? null : d;
}

// Ibéria/Brasil: janela pra TRÁS a partir de agora — [agora - daysBack
// dias às startHour, agora às endHour].
export function computeBackwardWindow(now, { startHour, endHour, daysBack }) {
  const start = new Date(now);
  start.setDate(start.getDate() - daysBack);
  start.setHours(startHour, 0, 0, 0);
  const end = new Date(now);
  end.setHours(endHour, 0, 0, 0);
  return { start, end };
}

// CAB: janela pra FRENTE a partir de hoje — [hoje às startHour (18h),
// hoje + daysForward dias às endHour (07h)].
export function computeForwardWindow(now, { startHour = 18, endHour = 7, daysForward }) {
  const start = new Date(now);
  start.setHours(startHour, 0, 0, 0);
  const end = new Date(now);
  end.setDate(end.getDate() + daysForward);
  end.setHours(endHour, 0, 0, 0);
  return { start, end };
}

// Ibéria/Brasil: filtra as linhas de um slot pela janela ativa (ou
// devolve tudo, ordenado do mais recente pro mais antigo, quando não há
// janela nenhuma aplicada ainda) — porta verbatim de renderTabela() na
// ferramenta original.
export function filterAndSortRowsByWindow(rows, window) {
  if (!rows.length) return rows;
  const cols = Object.keys(rows[0]);
  const colData = encontrarColunaData(cols);
  if (!colData) return rows;

  if (window) {
    return rows
      .filter((row) => {
        const dt = parseDateSN(row[colData]);
        return dt && dt >= window.start && dt <= window.end;
      })
      .sort((a, b) => {
        const dtA = parseDateSN(a[colData]);
        const dtB = parseDateSN(b[colData]);
        if (!dtA) return 1;
        if (!dtB) return -1;
        return dtA - dtB;
      });
  }

  return [...rows].sort((a, b) => {
    const dtA = parseDateSN(a[colData]);
    const dtB = parseDateSN(b[colData]);
    if (!dtA) return 1;
    if (!dtB) return -1;
    return dtB - dtA;
  });
}

const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const DIAS_SEMANA_PT = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export function nomeMesPt(monthIndex0) {
  return MESES_PT[monthIndex0] || "";
}

export function nomeDiaSemanaPt(date) {
  return DIAS_SEMANA_PT[date.getDay()];
}

export function fmtDtPt(date) {
  return date.toLocaleDateString("pt-PT") + " " + date.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}
