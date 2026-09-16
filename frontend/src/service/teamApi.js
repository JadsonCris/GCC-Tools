// service/teamApi.js
// CRUD do roster unificado da equipa (nome, equipa PT/BR, admin, oculto
// de métricas) — ver backend/services/team_service.py. Painel "Gestão de
// Equipa" em Base de Dados, admin-only.
import api from "./api";

export async function listMembers() {
  const { data } = await api.get("/team/members");
  return data;
}

export async function addMember(payload) {
  const { data } = await api.post("/team/members", payload);
  return data;
}

export async function updateMember(id, patch) {
  const { data } = await api.patch(`/team/members/${id}`, patch);
  return data;
}

export async function removeMember(id) {
  const { data } = await api.delete(`/team/members/${id}`);
  return data;
}
