// utils/turnosCalc.js
// Porta da lógica de cálculo da ferramenta HTML "Gestão de Turnos MOD"
// original (localStorage) — mesma lógica, adaptada pra trabalhar sobre
// dados vindos da API ({employeeId: {"YYYY-MM-DD": shift}}) em vez do
// "monthly: {'YYYY-M': {dia: turno}}" com mês 0-indexado do ficheiro
// original. Aqui `month` é sempre 1-indexado (Janeiro=1), consistente
// com o resto do backend desta app.

export const SHIFTS = [
  { key: "", label: "Apagar", short: "", color: null, hours: 0, night: 0, count: false },
  { key: "M", label: "Manhã", short: "", color: "#4CAF87", hours: 8, night: 0, count: true },
  { key: "T", label: "Tarde", short: "", color: "#F5D06F", hours: 8, night: 2, count: true },
  { key: "N", label: "Noite", short: "", color: "#E05B4A", hours: 8, night: 7, count: true },
  { key: "I", label: "Intermédio", short: "", color: "#5A5A5A", hours: 8, night: 0, count: true },
  { key: "F", label: "Férias", short: "F", color: "#2d84c9", hours: 0, night: 0, count: false },
  { key: "A", label: "Falta", short: "A", color: "#9c27b0", hours: 0, night: 0, count: false },
  { key: "H", label: "Feriado", short: "H", color: "#ff9800", hours: 0, night: 0, count: false },
];
const SHIFT_MAP = Object.fromEntries(SHIFTS.map((s) => [s.key, s]));
export function shiftByKey(k) {
  return SHIFT_MAP[k || ""] || SHIFTS[0];
}

export const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
export const MONTHS_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
export const WD = ["D", "S", "T", "Q", "Q", "S", "S"];
export const MAX_FREE_STREAK = 3;
export const REQUIRED = ["M", "T", "N"];

export const METRICS = [
  { key: "M", label: "Manhã" },
  { key: "T", label: "Tarde" },
  { key: "N", label: "Noite" },
  { key: "I", label: "Interm." },
  { key: "F", label: "Férias" },
  { key: "worked", label: "Dias Trab." },
  { key: "night", label: "H. Noturnas" },
  { key: "fdsTrab", label: "FDS Trab." },
  { key: "fdsLivre", label: "FDS Livres" },
];

function pad2(n) {
  return String(n).padStart(2, "0");
}
export function isoDate(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}
export function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}
export function weekdayOf(year, month, day) {
  return new Date(year, month - 1, day).getDay();
}
export function isWeekend(year, month, day) {
  const wd = weekdayOf(year, month, day);
  return wd === 0 || wd === 6;
}
export function dayShift(dm, year, month, day) {
  return (dm && dm[isoDate(year, month, day)]) || "";
}

export function weekendStats(dm, year, month, fromDay) {
  const nDays = daysInMonth(year, month);
  let fdsTrab = 0;
  let fdsLivre = 0;
  const start = fromDay && fromDay > 0 ? fromDay : 1;

  for (let d = start; d <= nDays; d++) {
    if (!isWeekend(year, month, d)) continue;
    const s = shiftByKey(dayShift(dm, year, month, d));
    if (s.count) fdsTrab++;
    else fdsLivre++;
  }
  return { fdsTrab, fdsLivre };
}

export function firstWorkDay(dm, year, month) {
  const nDays = daysInMonth(year, month);
  for (let d = 1; d <= nDays; d++) {
    if (shiftByKey(dayShift(dm, year, month, d)).count) return d;
  }
  return 0;
}

export function activeMonths(dm, year) {
  let count = 0;
  for (let m = 1; m <= 12; m++) {
    const nDays = daysInMonth(year, m);
    for (let d = 1; d <= nDays; d++) {
      if (dayShift(dm, year, m, d)) {
        count++;
        break;
      }
    }
  }
  return count;
}

/** Sequências de dias SEM turno atribuído (célula vazia) acima de MAX_FREE_STREAK. */
export function longFreeStreaks(dm, year, month) {
  const nDays = daysInMonth(year, month);
  const runs = [];
  let start = null;
  let len = 0;

  for (let d = 1; d <= nDays; d++) {
    const free = !dayShift(dm, year, month, d);
    if (free) {
      if (start === null) start = d;
      len++;
    } else {
      if (len > MAX_FREE_STREAK) runs.push({ start, end: d - 1, len });
      start = null;
      len = 0;
    }
  }
  if (len > MAX_FREE_STREAK) runs.push({ start, end: nDays, len });
  return runs;
}

export function computeEmployeeMonth(dm, year, month) {
  const nDays = daysInMonth(year, month);
  let M = 0, T = 0, N = 0, I = 0, F = 0, night = 0, worked = 0;

  for (let d = 1; d <= nDays; d++) {
    const k = dayShift(dm, year, month, d);
    if (!k) continue;
    const s = shiftByKey(k);
    if (k === "M") M++;
    if (k === "T") T++;
    if (k === "N") N++;
    if (k === "I") I++;
    if (k === "F") F++;
    if (s.count) {
      worked++;
      night += s.night;
    }
  }
  const ws = weekendStats(dm, year, month);
  return { M, T, N, I, F, night, worked, fdsTrab: ws.fdsTrab, fdsLivre: ws.fdsLivre };
}

/** Soma computeEmployeeMonth por vários meses (1-12) do mesmo ano — sem ajuste de FDS "a partir do 1º dia". */
export function computeEmployeeRange(dm, year, months) {
  const acc = { M: 0, T: 0, N: 0, I: 0, F: 0, night: 0, worked: 0, fdsTrab: 0, fdsLivre: 0 };
  months.forEach((m) => {
    const md = computeEmployeeMonth(dm, year, m);
    acc.M += md.M; acc.T += md.T; acc.N += md.N; acc.I += md.I; acc.F += md.F;
    acc.night += md.night; acc.worked += md.worked;
  });
  return acc;
}

/** Igual ao original: no anual, os FDS só contam a partir do 1º dia trabalhado do colaborador no ano. */
export function computeEmployeeAnnual(dm, year) {
  const totals = computeEmployeeRange(dm, year, Array.from({ length: 12 }, (_, i) => i + 1));
  let started = false;
  let fdsTrab = 0;
  let fdsLivre = 0;

  for (let m = 1; m <= 12; m++) {
    let fromDay = 1;
    if (!started) {
      const fwd = firstWorkDay(dm, year, m);
      if (fwd > 0) {
        fromDay = fwd;
        started = true;
      } else {
        continue;
      }
    }
    const ws = weekendStats(dm, year, m, fromDay);
    fdsTrab += ws.fdsTrab;
    fdsLivre += ws.fdsLivre;
  }

  const nMonths = Math.max(1, activeMonths(dm, year));
  return { ...totals, fdsTrab, fdsLivre, nMonths };
}

/** Cobertura M/T/N por dia do mês, somando todos os colaboradores visíveis. */
export function coverageByDay(yearShifts, employees, year, month) {
  const nDays = daysInMonth(year, month);
  const cov = {};
  for (let d = 1; d <= nDays; d++) cov[d] = { M: 0, T: 0, N: 0, I: 0 };

  employees.forEach((emp) => {
    const dm = yearShifts[String(emp.id)] || {};
    for (let d = 1; d <= nDays; d++) {
      const k = dayShift(dm, year, month, d);
      if (cov[d][k] !== undefined) cov[d][k]++;
    }
  });
  return cov;
}
