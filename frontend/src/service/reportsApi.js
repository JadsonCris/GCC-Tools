// service/reportsApi.js
// Geração de e-mails (Outlook/win32com, ver backend/services/
// reports_email_service.py) — abre um rascunho no Outlook local pro
// utilizador rever/enviar, não envia sozinho.
import api from "./api";

// URLs de export do ServiceNow pros botões "Descarregar" — configuradas
// no .env do backend (ver routers/reports_email.py, GET
// /reports/export-config), não hardcoded no frontend. `url: null` numa
// entrada quando a variável correspondente não está no .env.
export async function getReportsExportConfig() {
  const { data } = await api.get("/reports/export-config");
  return data;
}

export async function sendP1SemanalReport(linhas) {
  const { data } = await api.post("/reports/p1-semanal/enviar", { linhas });
  return data;
}

export async function sendCabReport({ tipo, texto_inicio, texto_fim, changes }) {
  const { data } = await api.post("/reports/cab/enviar", { tipo, texto_inicio, texto_fim, changes });
  return data;
}

export async function sendOutlookReport({ regiao, tipo, tabelas }) {
  const { data } = await api.post("/reports/outlook/enviar", { regiao, tipo, tabelas });
  return data;
}
