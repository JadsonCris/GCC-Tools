// services/dashboardApi.js
import api from "./api";

// 1. Funções originais
export async function getKPIs() {
  const { data } = await api.get("/dashboard/kpis");
  return data;
}

export async function getPriorityBreakdown() {
  const { data } = await api.get("/dashboard/priority");
  return data;
}

export async function getToolsBreakdown() {
  const { data } = await api.get("/dashboard/tools");
  return data;
}

export async function getAioperSummary() {
  const { data } = await api.get("/dashboard/aioper");
  return data;
}

export async function getIncidentsSummary() {
  const { data } = await api.get("/incidents");
  return data;
}

export async function getSLAOverview() {
  const { data } = await api.get("/sla");
  return data;
}

export async function getOperatorsSummary() {
  const { data } = await api.get("/operators");
  return data;
}

export async function getOperatorDetail(tecnico, start, end, region) {
  const params = {};
  if (start && end) {
    params.start = start;
    params.end = end;
  }
  if (region && region !== "Global") params.region = region;
  const { data } = await api.get(`/operators/${encodeURIComponent(tecnico)}`, { params });
  return data;
}

export async function getCacheStatus() {
  const { data } = await api.get("/dashboard/status");
  return data;
}

export async function getAvailableMonths() {
  const { data } = await api.get("/dashboard/months");
  return data.months;
}

export async function getMonthlySummary(month, region) {
  const params = {};
  if (month) params.month = month;
  if (region && region !== "Global") params.region = region;
  const { data } = await api.get("/dashboard/monthly", { params });
  return data;
}

export async function getDateBounds() {
  const { data } = await api.get("/dashboard/bounds");
  return data;
}

export async function getRangeSummary(start, end, region) {
  const params = { start, end };
  if (region && region !== "Global") params.region = region;
  const { data } = await api.get("/dashboard/range", { params });
  return data;
}

export async function getSlaTrend(region) {
  const params = {};
  if (region && region !== "Global") params.region = region;
  const { data } = await api.get("/dashboard/sla-trend", { params });
  return data.months;
}

export async function getIncidentsByStatus(status, start, end, region) {
  const params = { status, start, end };
  if (region && region !== "Global") params.region = region;
  const { data } = await api.get("/dashboard/incidents-by-status", { params });
  return data.incidents;
}

// 2. Conexões analíticas (backend: routers/analytics.py, prefixo /analytics)
export async function getQualityMetrics() {
  const { data } = await api.get("/analytics/quality");
  return data;
}

export async function getBacklogSummary() {
  const { data } = await api.get("/analytics/backlog");
  return data;
}

export async function getSla3Detailed() {
  const { data } = await api.get("/analytics/sla3-detailed");
  return data;
}

export async function getSla4Detailed() {
  const { data } = await api.get("/analytics/sla4-detailed");
  return data;
}

export async function getDespromovidosSummary() {
  const { data } = await api.get("/analytics/despromovidos");
  return data;
}

export async function getSemEventoSummary() {
  const { data } = await api.get("/analytics/sem-evento");
  return data;
}
