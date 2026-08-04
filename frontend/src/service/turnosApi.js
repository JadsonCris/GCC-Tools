// service/turnosApi.js
// Gestão de Turnos — ao contrário do resto da app, esta API tem
// endpoints de ESCRITA (o utilizador edita a escala dentro da própria
// app, em vez de só ler dados do ServiceNow).
import api from "./api";

export async function getEmployees() {
  const { data } = await api.get("/turnos/employees");
  return data;
}

export async function createEmployee(name, pos = "MOD") {
  const { data } = await api.post("/turnos/employees", { name, pos });
  return data;
}

export async function updateEmployee(id, patch) {
  const { data } = await api.patch(`/turnos/employees/${id}`, patch);
  return data;
}

export async function deleteEmployee(id) {
  const { data } = await api.delete(`/turnos/employees/${id}`);
  return data;
}

// {employeeId (string): {"YYYY-MM-DD": shift}} — ano inteiro
export async function getShiftsForYear(year) {
  const { data } = await api.get("/turnos/shifts", { params: { year } });
  return data;
}

// Substitui os turnos desse colaborador nesse mês (month 1-indexado)
export async function saveMonthShifts(employeeId, year, month, days) {
  const { data } = await api.put(`/turnos/employees/${employeeId}/shifts`, { year, month, days });
  return data;
}

export async function clearMonth(year, month) {
  const { data } = await api.post("/turnos/clear-month", { year, month });
  return data;
}
