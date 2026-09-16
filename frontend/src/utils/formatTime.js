// utils/formatTime.js
// Formatação de durações — usado nos gráficos de SLA1 (tempo médio de
// escalonamento), que guardam o valor em minutos mas representam uma
// duração, não um número absoluto (mesma ideia já usada em
// pages/MajorIncs.jsx pro gráfico "Total de Tempo em Call", só que a
// partir de minutos em vez de segundos).

/** Minutos (float) -> "HH:MM:SS". */
export function minutesToHms(minutes) {
  const totalSeconds = Math.max(0, Math.round((Number(minutes) || 0) * 60));
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}
