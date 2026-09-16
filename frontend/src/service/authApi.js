// service/authApi.js
// Identidade do utilizador atual (ver backend/services/auth_service.py)
// — decide o que a sidebar mostra. Gestão de quem é admin passou para
// service/teamApi.js (roster unificado, ver backend/services/team_service.py).
import api from "./api";

export async function getMe() {
  const { data } = await api.get("/auth/me");
  return data;
}
