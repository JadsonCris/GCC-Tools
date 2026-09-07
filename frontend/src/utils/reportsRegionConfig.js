// utils/reportsRegionConfig.js
// Constantes por região (Ibéria/Brasil) do Report matinal — janela
// horária, os 4 slots de import e os títulos de secção usados no corpo
// do e-mail (ver backend/services/reports_email_service.py,
// montar_corpo_html — as chaves de `tabelas` viram os títulos das
// secções, na mesma ordem em que são inseridas no dict).
// `accent` — mesma paleta de utils/reportsAccent.js — diferencia
// visualmente as duas regiões (separador ativo, botões de download,
// filtro e envio) quando o utilizador troca de aba.
export const REGIONS = {
  ib: { label: "Ibéria", startHour: 20, endHour: 8, accent: "blue" },
  br: { label: "Brasil", startHour: 23, endHour: 11, accent: "emerald" },
};

export const SLOTS = ["p1Matinal", "incsDiario", "backups", "batchs"];

// Rótulos de reserva enquanto GET /api/reports/export-config ainda não
// respondeu (ou se o backend não tiver sido reiniciado depois de editar
// o .env) — evita mostrar a chave JS crua (ex: "incsDiario") no ecrã.
export const SLOT_LABELS = {
  p1Matinal: "P1 Matinal",
  incsDiario: "INCs Diário",
  backups: "Backups",
  batchs: "Batchs",
};

// Título da secção no e-mail pra cada slot — "incsDiario" muda consoante
// a região (mesma janela horária mencionada no texto).
export function sectionTitles(region) {
  const janela = region === "ib" ? "20h/08H" : "23h/11H";
  return {
    p1Matinal: "- Atualização de Incidentes Críticos P1:",
    backups: "- Backups - como correram:",
    batchs: "- Batch jobs - como correram:",
    incsDiario: `- Lista de Incidentes abertos durante a noite (${janela}):`,
  };
}
