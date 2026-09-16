// utils/operationalActivityCalc.js
// Recalcula a vista "Global" da Atividade Operacional excluindo
// operadores ocultos (filtro de operadores) — inteiramente no frontend,
// somando as vistas "individual" já devolvidas pelo backend (que trazem
// os mesmos campos por operador que o "global"), sem precisar de um
// pedido novo ao backend a cada vez que se oculta/mostra alguém.
//
// LIMITAÇÃO CONHECIDA: "dias_ativos_*" (e por isso "avg_*_dia") usa o
// máximo entre os operadores visíveis como aproximação dos dias
// distintos do conjunto unido — o payload não expõe a contagem dia a dia
// necessária pra unir os conjuntos com exatidão. Na prática costuma ser
// muito próximo do valor real (a maioria dos dias tem mais que um
// operador ativo). "peak_day" (recorde por DIA do mês, não por hora/
// dia-da-semana/mês) também não é recalculável — o payload só traz o
// resultado já calculado pro conjunto completo, não a contagem diária —
// por isso fica omitido quando o filtro está ativo, em vez de mostrar um
// valor que pode já não ser o pico real do subconjunto.
const TURNOS = ["Manhã", "Tarde", "Noite"];
const STREAMS = ["abertos", "resolvidos", "cis"];

function round2(n) {
  return Math.round(n * 100) / 100;
}

function sumBy(list, fn) {
  return list.reduce((acc, item) => acc + (fn(item) || 0), 0);
}

function sumSeries(list, seriesFn) {
  const base = seriesFn(list[0]) || [];
  return base.map((row, i) => {
    const out = { ...row };
    STREAMS.forEach((k) => {
      out[k] = sumBy(list, (item) => seriesFn(item)?.[i]?.[k]);
    });
    return out;
  });
}

function peakOf(rows, xKey, valueKey) {
  let label = null;
  let val = 0;
  rows.forEach((r) => {
    if (r[valueKey] > val) {
      val = r[valueKey];
      label = r[xKey];
    }
  });
  return { label, val };
}

function destaquesFor(horaria, semana, mensal, key) {
  const hora = peakOf(horaria, "hour", key);
  const dia = peakOf(semana, "weekday", key);
  const mes = peakOf(mensal, "month", key);
  return {
    peak_day: null,
    peak_day_val: 0,
    peak_hour: hora.label ? Number(String(hora.label).replace("h", "")) : 0,
    peak_hour_val: hora.val,
    peak_weekday: dia.label,
    best_month: mes.label,
    best_month_val: mes.val,
  };
}

/**
 * Agrega uma lista de vistas "individual" (mesmo formato do payload de
 * operational_activity) num único objeto no formato "global" — usado
 * tanto pra recalcular o Global excluindo operadores ocultos quanto pra
 * construir os cards por equipa (PT/BR/Neutra/AIOPS) em EquipaTab.jsx.
 * Devolve `null` se a lista vier vazia.
 */
export function aggregateIndividuals(visible) {
  if (!visible.length) return null;

  const kpis = {
    total_abertos: sumBy(visible, (o) => o.kpis.total_abertos),
    total_resolvidos: sumBy(visible, (o) => o.kpis.total_resolvidos),
    total_cis: sumBy(visible, (o) => o.kpis.total_cis),
    dias_ativos_abertos: Math.max(0, ...visible.map((o) => o.kpis.dias_ativos_abertos)),
    dias_ativos_resolvidos: Math.max(0, ...visible.map((o) => o.kpis.dias_ativos_resolvidos)),
    dias_ativos_cis: Math.max(0, ...visible.map((o) => o.kpis.dias_ativos_cis)),
  };
  kpis.avg_abertos_dia = kpis.dias_ativos_abertos ? round2(kpis.total_abertos / kpis.dias_ativos_abertos) : 0;
  kpis.avg_resolvidos_dia = kpis.dias_ativos_resolvidos
    ? round2(kpis.total_resolvidos / kpis.dias_ativos_resolvidos)
    : 0;
  kpis.avg_cis_dia = kpis.dias_ativos_cis ? round2(kpis.total_cis / kpis.dias_ativos_cis) : 0;

  const distribuicao_horaria = sumSeries(visible, (o) => o.distribuicao_horaria);
  const distribuicao_semana = sumSeries(visible, (o) => o.distribuicao_semana);
  const evolucao_mensal = sumSeries(visible, (o) => o.evolucao_mensal);

  const turnos = { abertos: {}, resolvidos: {}, cis: {} };
  STREAMS.forEach((stream) => {
    const dias = kpis[`dias_ativos_${stream}`];
    TURNOS.forEach((t) => {
      const count = sumBy(visible, (o) => o.turnos[stream]?.[t]?.count);
      turnos[stream][t] = { count, avg_per_day: dias ? round2(count / dias) : 0 };
    });
  });

  const equipas = {
    abertos: { PT: 0, BR: 0, "-": 0 },
    resolvidos: { PT: 0, BR: 0, "-": 0 },
    cis: { PT: 0, BR: 0, "-": 0 },
  };
  visible.forEach((o) => {
    STREAMS.forEach((stream) => {
      const key = stream === "abertos" ? "total_abertos" : stream === "resolvidos" ? "total_resolvidos" : "total_cis";
      equipas[stream][o.team] = (equipas[stream][o.team] || 0) + o.kpis[key];
    });
  });

  const destaques = {
    abertos: destaquesFor(distribuicao_horaria, distribuicao_semana, evolucao_mensal, "abertos"),
    resolvidos: destaquesFor(distribuicao_horaria, distribuicao_semana, evolucao_mensal, "resolvidos"),
    cis: destaquesFor(distribuicao_horaria, distribuicao_semana, evolucao_mensal, "cis"),
  };

  return { kpis, destaques, turnos, distribuicao_horaria, distribuicao_semana, evolucao_mensal, equipas };
}

/**
 * `data`: payload de operational_activity ({global, individual}) tal
 * como devolvido por /dashboard/monthly ou /dashboard/range. `hiddenSet`:
 * Set de nomes de "tecnico" a excluir. Sem operadores ocultos, devolve
 * `data` tal como veio (sem recalcular nada).
 */
export function filterOperationalActivity(data, hiddenSet) {
  if (!data || !hiddenSet || hiddenSet.size === 0) return data;

  const visible = (data.individual ?? []).filter((o) => !hiddenSet.has(o.tecnico));
  return { ...data, individual: visible, global: aggregateIndividuals(visible) };
}
