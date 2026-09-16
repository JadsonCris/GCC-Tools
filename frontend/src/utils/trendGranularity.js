// utils/trendGranularity.js
// Agrega uma série "por dia" (já sem buracos — ver backend/services/
// major_incs_service.py _all_days_between) por mês ou por ano, somando
// as colunas numéricas indicadas. "dia" devolve os dados tal como vêm,
// sem agregação nenhuma.
export const GRANULARITY_OPTIONS = [
  { value: "dia", label: "Dia" },
  { value: "mes", label: "Mês" },
  { value: "ano", label: "Ano" },
];

function bucketKey(dateStr, granularity) {
  if (granularity === "ano") return dateStr.slice(0, 4);
  if (granularity === "mes") return dateStr.slice(0, 7);
  return dateStr;
}

export function aggregateByGranularity(data, granularity, sumKeys, dateKey = "date") {
  if (granularity === "dia" || !data.length) return data;

  const buckets = new Map();
  for (const row of data) {
    const key = bucketKey(row[dateKey], granularity);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { [dateKey]: key };
      for (const k of sumKeys) bucket[k] = 0;
      buckets.set(key, bucket);
    }
    for (const k of sumKeys) bucket[k] += Number(row[k]) || 0;
  }
  return Array.from(buckets.values()).sort((a, b) => (a[dateKey] < b[dateKey] ? -1 : a[dateKey] > b[dateKey] ? 1 : 0));
}
