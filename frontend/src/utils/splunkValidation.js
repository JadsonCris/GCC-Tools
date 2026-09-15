// utils/splunkValidation.js
// Motor de cruzamento EdpOn x Splunk ITSI — portado verbatim da
// ferramenta standalone (originalmente de "OpTerminal.html", mantido
// "tal-e-qual" na migração pra gcc_tools.html). 100% funções puras,
// sem I/O — a leitura de ficheiro fica em splunkFileRead.js.
import * as XLSX from "xlsx";

export const TICKET_REGEX = /\b(INC|CHG|RITM|OUT)\d+\b/gi;
export const STATE_REGEX =
  /\b(Resolved|Closed|Canceled|Cancelled|On Hold|On-Hold|New|In Progress|In-Progress|Assigned|Atribuido|Atribuído|Pending)\b/i;

// Marcas de acento (combining diacritics) pra gerar slugs de id a partir de
// nomes de estado (ex: "Não Encontrado" -> "Nao-Encontrado").
const DIACRITICS_RE = new RegExp("[" + String.fromCodePoint(0x0300) + "-" + String.fromCodePoint(0x036f) + "]", "g");

export function slugState(s) {
  return s.normalize("NFD").replace(DIACRITICS_RE, "").replace(" ", "-");
}

export function normalizeState(stateStr) {
  const s = stateStr.toUpperCase();
  if (s.includes("RESOLVED")) return "Resolvido";
  if (s.includes("CLOSED")) return "Fechado";
  if (s.includes("CANCEL")) return "Cancelado";
  if (s.includes("HOLD") || s.includes("PENDING")) return "Em Espera";
  if (s.includes("NEW")) return "Novo";
  if (s.includes("PROGRESS")) return "Em Curso";
  if (s.includes("ASSIGNED") || s.includes("ATRIBUIDO") || s.includes("ATRIBUÍDO")) return "Atribuído";
  return "Desconhecido";
}

export function translateSplunkSev(sev) {
  if (!sev || sev === "-") return "-";
  const s = sev.toString().trim();
  if (s === "6") return "1";
  if (s === "5") return "2";
  if (s === "4") return "3";
  if (s === "3") return "4";
  if (s === "2") return "C";
  if (s === "1") return "C";
  return s;
}

export function normalizePriority(p) {
  if (!p) return "-";
  p = p.toUpperCase();
  if (p.includes("1") || p.includes("CRITICAL")) return "1";
  if (p.includes("2") || p.includes("HIGH")) return "2";
  if (p.includes("3") || p.includes("MODERATE") || p.includes("MEDIUM")) return "3";
  if (p.includes("4") || p.includes("LOW")) return "4";
  return "-";
}

export function parseCSVLine(str, delimiter) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '"' && str[i + 1] === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

export function extractMapData(text) {
  const map = new Map();
  if (!text) return map;
  const lines = text.split(/\r?\n/);
  const delimiter = text.includes("\t") ? "\t" : text.includes(";") ? ";" : ",";
  let headers = [];
  let headerIdx = -1;
  let numCol = -1;
  let stateCol = -1;
  let prioCol = -1;

  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const lower = lines[i].toLowerCase();
    if (lower.includes("number") || lower.includes("número") || lower.includes("ticket")) {
      headers = parseCSVLine(lines[i], delimiter).map((h) => h.toLowerCase().trim());
      headerIdx = i;
      break;
    }
  }

  if (headerIdx !== -1) {
    numCol = headers.findIndex((h) => h.includes("number") || h.includes("número") || h.includes("ticket"));
    stateCol = headers.findIndex((h) => h === "state" || h === "estado" || h === "incident state");
    prioCol = headers.findIndex((h) => h === "priority" || h === "prioridade");
  }

  for (let i = 0; i < lines.length; i++) {
    if (i === headerIdx) continue;
    const lineTrimmed = lines[i].trim();
    if (!lineTrimmed) continue;

    let ticket = null;
    let state = "Desconhecido";
    let priority = "-";
    const isDynatrace = lineTrimmed.toUpperCase().includes("DYNATRACE");

    if (numCol !== -1) {
      const cols = parseCSVLine(lineTrimmed, delimiter);
      const tMatch = cols[numCol] ? cols[numCol].match(TICKET_REGEX) : null;
      if (tMatch) {
        ticket = tMatch[0].toUpperCase();
        if (stateCol !== -1 && cols[stateCol]) {
          state = normalizeState(cols[stateCol]);
        } else {
          const sm = lineTrimmed.match(STATE_REGEX);
          if (sm) state = normalizeState(sm[0]);
        }
        if (prioCol !== -1 && cols[prioCol]) {
          priority = cols[prioCol].trim();
        }
      }
    }

    if (!ticket) {
      const ticketMatch = lineTrimmed.match(TICKET_REGEX);
      if (ticketMatch) {
        ticket = ticketMatch[0].toUpperCase();
        const stateMatch = lineTrimmed.match(STATE_REGEX);
        state = stateMatch ? normalizeState(stateMatch[0]) : "Desconhecido";

        const prioMatch = lineTrimmed.match(/\b([1-4]\s*-\s*(Critical|High|Moderate|Low)|P[1-4]|Critical|High|Moderate|Low)\b/i);
        if (prioMatch) priority = prioMatch[0].trim();
      }
    }

    if (ticket) {
      map.set(ticket, { state, priority: normalizePriority(priority), isDynatrace });
    }
  }
  return map;
}

export function extractSplunkData(text) {
  const map = new Map();
  if (!text) return map;
  const lines = text.split(/\r?\n/);
  const delimiter = text.includes("\t") ? "\t" : text.includes(";") ? ";" : ",";

  let headers = [];
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const lower = lines[i].toLowerCase();
    if (lower.includes("severity") || lower.includes("ticket")) {
      headers = parseCSVLine(lines[i], delimiter).map((h) => h.toLowerCase().trim());
      headerIdx = i;
      break;
    }
  }

  const sevCol = headers.findIndex((h) => h === "severity" || h === "severidade");

  for (let i = 0; i < lines.length; i++) {
    if (i === headerIdx) continue;
    const line = lines[i].trim();
    if (!line) continue;

    const ticketMatch = line.match(TICKET_REGEX);
    if (ticketMatch) {
      const ticket = ticketMatch[0].toUpperCase();
      let severity = "-";
      let wasClosed = false;
      const cols = parseCSVLine(line, delimiter);
      const extractDigits = (val) => val.match(/\d/g) || [];

      if (sevCol !== -1 && cols[sevCol]) {
        const digits = extractDigits(cols[sevCol]);
        if (digits.length > 0) {
          if ((digits[0] === "2" || digits[0] === "1") && digits.length > 1) {
            wasClosed = true;
            severity = digits[1];
          } else {
            wasClosed = false;
            severity = digits[0];
          }
        }
      } else {
        for (const c of cols) {
          const digits = extractDigits(c);
          const validDigits = digits.filter((d) => parseInt(d, 10) >= 1 && parseInt(d, 10) <= 6);
          if (validDigits.length > 0) {
            if ((validDigits[0] === "2" || validDigits[0] === "1") && validDigits.length > 1) {
              wasClosed = true;
              severity = validDigits[1];
            } else {
              wasClosed = false;
              severity = validDigits[0];
            }
            break;
          }
        }
      }
      map.set(ticket, { severity, wasClosed });
    }
  }
  return map;
}

export function calculateTotalTickets(text) {
  if (!text) return 0;
  const matches = text.match(TICKET_REGEX) || [];
  return matches.length;
}

export function formatNocTimestamp(d) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(
    d.getHours()
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

// ── Leitura de ficheiro ──────────────────────────────────────────────
async function readNativeCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

async function readExcelWithSheetJS(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
        resolve(json.map((row) => row.join("\t")).join("\n"));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// `isSplunk`: o Splunk só aceita .csv (lança se vier .xls/.xlsx) — mesma
// regra do original.
export async function processFile(file, isSplunk = false) {
  if (!file) return "";
  const ext = file.name.split(".").pop().toLowerCase();

  if (ext === "csv" || ext === "txt") {
    return readNativeCSV(file);
  }
  if (ext === "xls" || ext === "xlsx") {
    if (isSplunk) {
      throw new Error("Splunk apenas aceita .CSV!");
    }
    return readExcelWithSheetJS(file);
  }
  throw new Error("Tipo de ficheiro não suportado.");
}

// ── Classificação/comparação ─────────────────────────────────────────
export const CATEGORY_ORDER = ["Resolvido", "Fechado", "Cancelado", "Em Espera", "Novo", "Atribuído", "Em Curso", "Não Encontrado"];

export const CATEGORY_COLORS = {
  Resolvido: "var(--sv-edp-green)",
  Fechado: "var(--sv-edp-green-hover)",
  Cancelado: "var(--sv-status-red)",
  "Em Espera": "var(--sv-status-orange)",
  Novo: "var(--sv-snow-blue)",
  Atribuído: "#ca8a04",
  "Em Curso": "var(--sv-edp-purple)",
  "Não Encontrado": "#64748b",
};

// Cruza os tickets do Splunk com o mapa EdpOn e classifica cada um numa
// das 8 categorias de estado, já anotado com as flags de estilo
// (isMismatch/isWarning/isMatch/isNormalClosed) — mesma lógica de
// processComparison() no original, só sem tocar no DOM.
export function buildComparisonCategories(edponMap, splunkMap) {
  const categories = {};
  CATEGORY_ORDER.forEach((c) => {
    categories[c] = [];
  });

  for (const ticket of splunkMap.keys()) {
    const splunkData = splunkMap.get(ticket) || { severity: "-", wasClosed: false };
    let found = false;

    if (edponMap.has(ticket)) {
      const d = edponMap.get(ticket);
      const item = {
        textId: ticket,
        rawNum: ticket,
        source: "edpon",
        snowPrio: d.priority,
        splunkSev: splunkData.severity,
        wasClosed: splunkData.wasClosed,
        state: d.state,
        isDynatrace: d.isDynatrace,
      };
      if (categories[d.state]) {
        categories[d.state].push(item);
      } else {
        categories["Não Encontrado"].push({ ...item, textId: `${ticket} (EdpOn: Sem estado)` });
      }
      found = true;
    }

    if (!found) {
      categories["Não Encontrado"].push({
        textId: ticket,
        rawNum: ticket,
        source: "none",
        snowPrio: "-",
        splunkSev: splunkData.severity,
        wasClosed: splunkData.wasClosed,
        state: "Desconhecido",
        isDynatrace: false,
      });
    }
  }

  for (const cat of CATEGORY_ORDER) {
    categories[cat] = categories[cat].map((item) => {
      let isMismatch = false;
      let isWarning = false;
      let isMatch = false;
      if (item.source !== "none") {
        const transSev = translateSplunkSev(item.splunkSev);
        const match = transSev === item.snowPrio;
        if (item.wasClosed) {
          if (match) isMatch = true;
          else isWarning = true;
        } else if (transSev === "C") {
          if (["Resolvido", "Fechado", "Cancelado"].includes(item.state)) isMatch = true;
          else isMismatch = true;
        } else if (match) {
          isMatch = true;
        } else {
          isMismatch = true;
        }
      }
      const isNormalClosed = translateSplunkSev(item.splunkSev) === "C" || item.wasClosed;
      return { ...item, isMismatch, isWarning, isMatch, isNormalClosed };
    });
  }
  return categories;
}

// Vista de análise (Motor de Análise) — porta de openAnalysis(), sem DOM.
export function buildAnalysisData(edponText, splunkText) {
  const lines = (edponText || "").split(/\r?\n/);
  const dataMap = extractMapData(edponText);
  const splunkMap = extractSplunkData(splunkText || "");

  const counts = { inc: 0, chg: 0, ritm: 0, out: 0 };
  const stateCounts = {
    Resolvido: 0, Fechado: 0, Cancelado: 0, "Em Espera": 0,
    Novo: 0, Atribuído: 0, "Em Curso": 0, Desconhecido: 0,
  };
  const items = [];

  for (const line of lines) {
    const lineTrimmed = line.trim();
    if (!lineTrimmed) continue;

    const ticketMatch = lineTrimmed.match(TICKET_REGEX);
    if (!ticketMatch) continue;

    const ticket = ticketMatch[0].toUpperCase();
    let type = "Desconhecido";
    if (ticket.startsWith("INC")) { type = "Incidente"; counts.inc++; }
    else if (ticket.startsWith("CHG")) { type = "Alteração"; counts.chg++; }
    else if (ticket.startsWith("RITM")) { type = "Pedido"; counts.ritm++; }
    else if (ticket.startsWith("OUT")) { type = "Indisponibilidade"; counts.out++; }

    let state = "Desconhecido";
    let priority = "-";
    const severity = (splunkMap.get(ticket) || { severity: "-" }).severity;

    if (dataMap.has(ticket)) {
      state = dataMap.get(ticket).state;
      priority = dataMap.get(ticket).priority;
    }

    stateCounts[state] = (stateCounts[state] || 0) + 1;
    items.push({ ticket, type, state, priority, severity, raw: lineTrimmed });
  }

  return { items, counts, stateCounts };
}
