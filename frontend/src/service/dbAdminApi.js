// service/dbAdminApi.js
// View "Base de Dados" — inspeção genérica das tabelas da dashboard.db,
// só leitura (ver backend/routers/db_admin.py).
import api from "./api";

export async function getTables() {
  const { data } = await api.get("/db/tables");
  return data;
}

export async function getTableData(table, limit = 50, offset = 0, orderBy = null, orderDir = "asc") {
  const params = { limit, offset };
  if (orderBy) {
    params.order_by = orderBy;
    params.order_dir = orderDir;
  }
  const { data } = await api.get(`/db/tables/${encodeURIComponent(table)}`, { params });
  return data;
}

// Tabelas que o backend sabe processar via upload manual, cada uma como
// {table, download_url} — download_url é o link exato do ServiceNow
// (mesmo usado pela busca automática, garante as colunas certas) ou
// null pras tabelas do SharePoint (justificacoes/calls). Ver
// cache.importable_tables_with_download_urls. Inclui tabelas que a app
// ainda não tenha conseguido buscar nenhuma vez (ex: "despromovidos").
export async function getImportableTables() {
  const { data } = await api.get("/db/importable-tables");
  return data.tables;
}

// Upload manual pra dentro de uma tabela — grava direto na BD (ver
// cache.ingest_manual_upload), usado quando a busca automática ao
// ServiceNow falhar. `headers: { "Content-Type": undefined }` remove o
// "application/json" default desta instância do axios pra este pedido,
// deixando o browser montar o boundary do multipart sozinho.
export async function uploadTable(table, file) {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post(`/db/tables/${encodeURIComponent(table)}/upload`, formData, {
    headers: { "Content-Type": undefined },
  });
  return data;
}
