// utils/reportsFiles.js
import * as XLSX from "xlsx";

// Lê um .xls/.xlsx no browser (drag-drop ou <input type=file>) e devolve
// as linhas da primeira sheet como array de objetos — usado pelos 3
// imports client-side dos Reports (P1 Semanal, CAB, Ibéria/Brasil).
// Nada disto passa pelo backend: o ficheiro já foi baixado manualmente
// do ServiceNow pelo próprio utilizador (sessão de browser autenticada).
export async function parseXlsFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { raw: false, defval: "" });
}
