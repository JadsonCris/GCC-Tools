// utils/equilibrioCalc.js
// Deteção de desequilíbrio de carga entre uma pessoa da equipa PT e uma
// da equipa BR que trabalharam em simultâneo — porta de
// eqBuild/eqOverlap/eqMetricFlag do protótipo v20 "Equilíbrio de
// Turnos". Opera sobre as MESMAS sessões devolvidas por
// GET /dashboard/timeline (ver TimelineTab.jsx/EquilibrioTab.jsx) —
// nenhum pedido novo ao backend, os controlos ficam instantâneos.
//
// LIMITAÇÃO CONHECIDA: o protótipo original tinha acesso a cada evento
// individual dentro da janela de sobreposição; aqui só temos as sessões
// já agregadas pelo backend (uma sessão = um período contínuo, com o
// total de inc/res/ci do período INTEIRO). `countInWindow` aproxima a
// contagem dentro da sobreposição distribuindo o total da sessão
// proporcionalmente à fração de tempo sobreposta — exato quando a sessão
// cai inteiramente dentro da janela (o caso mais comum), aproximado nos
// casos de borda (sessão só parcialmente sobreposta).

const METRIC_LABELS = { inc: "Incidentes", res: "Resolvidos", ci: "CI's" };

function overlap(a, b) {
  const start = Math.max(a.startMs, b.startMs);
  const end = Math.min(a.endMs, b.endMs);
  return end > start ? { start, end, minutes: (end - start) / 60000 } : null;
}

function countInWindow(session, start, end) {
  const dur = session.endMs - session.startMs;
  if (dur <= 0) return { inc: 0, res: 0, ci: 0, total: 0 };
  const s = Math.max(session.startMs, start);
  const e = Math.min(session.endMs, end);
  const frac = Math.max(0, e - s) / dur;
  const inc = Math.round(session.inc * frac);
  const res = Math.round(session.res * frac);
  const ci = Math.round(session.ci * frac);
  return { inc, res, ci, total: inc + res + ci };
}

function metricFlag(a, b, minDiff, minPct) {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  const diff = hi - lo;
  if (diff < minDiff || hi === 0) return false;
  return lo === 0 || (diff / lo) * 100 >= minPct;
}

/**
 * `sessions`: array devolvido por GET /dashboard/timeline. `opts`:
 * {minOverlapMin, minDiff, minPctImbalance, metric ("any"|"inc"|"res"|"ci"), day (opcional, "YYYY-MM-DD")}.
 * Devolve {coexistence, discrepancies} — `discrepancies` só os pares
 * PT↔BR cuja diferença ultrapassa os critérios pedidos.
 */
export function buildEquilibrio(sessions, { minOverlapMin, minDiff, minPctImbalance, metric, day }) {
  const withMs = sessions.map((s) => ({
    ...s,
    startMs: new Date(s.start).getTime(),
    endMs: new Date(s.end).getTime(),
  }));

  const byDay = {};
  withMs.forEach((s) => {
    const dayKey = new Date(s.startMs).toISOString().slice(0, 10);
    if (day && dayKey !== day) return;
    (byDay[dayKey] ??= []).push(s);
  });

  const coexistence = [];
  const discrepancies = [];

  Object.entries(byDay).forEach(([dayKey, list]) => {
    const pts = list.filter((s) => s.team === "PT");
    const brs = list.filter((s) => s.team === "BR");
    pts.forEach((a) => {
      brs.forEach((b) => {
        const ov = overlap(a, b);
        if (!ov || ov.minutes < minOverlapMin) return;
        const ca = countInWindow(a, ov.start, ov.end);
        const cb = countInWindow(b, ov.start, ov.end);
        if (ca.total === 0 && cb.total === 0) return;

        const item = { day: dayKey, a: a.tecnico, b: b.tecnico, start: ov.start, end: ov.end, minutes: ov.minutes, ca, cb };
        coexistence.push(item);

        const flags = [];
        ["inc", "res", "ci"].forEach((key) => {
          if (metric !== "any" && metric !== key) return;
          if (metricFlag(ca[key], cb[key], minDiff, minPctImbalance)) {
            flags.push({ label: METRIC_LABELS[key], a: ca[key], b: cb[key], diff: Math.abs(ca[key] - cb[key]) });
          }
        });
        if (flags.length) discrepancies.push({ ...item, flags });
      });
    });
  });

  return { coexistence, discrepancies };
}
