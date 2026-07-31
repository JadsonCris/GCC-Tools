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

export async function getCacheStatus() {
  const { data } = await api.get("/dashboard/status");
  return data;
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
