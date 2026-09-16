// components/CentralOperacional/EquilibrioTab.jsx
// "Equilíbrio de Turnos" — sinaliza dias em que uma pessoa PT e uma
// pessoa BR trabalharam em simultâneo com cargas muito diferentes (ver
// utils/equilibrioCalc.js). Reaproveita a MESMA queryKey/sessões da
// Timeline (mesmo mês/ano/região/ocultos) — react-query partilha o
// cache, não duplica o pedido ao backend — pra os controlos abaixo
// ficarem instantâneos.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getOperationalTimeline } from "../../service/dashboardApi";
import { MONTHS } from "../../utils/turnosCalc";
import { Kpi } from "./shared";
import { buildEquilibrio } from "../../utils/equilibrioCalc";

const YEAR_MIN = 2026;
const YEAR_MAX = 2030;
const selectClass =
  "px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200";

function fmtDay(d) {
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
}
function fmtTime(ms) {
  return new Date(ms).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

export default function EquilibrioTab({ region, hidden }) {
  const now = new Date();
  const [year, setYear] = useState(Math.min(Math.max(now.getFullYear(), YEAR_MIN), YEAR_MAX));
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [day, setDay] = useState("");
  const [minOverlap, setMinOverlap] = useState(120);
  const [minDiff, setMinDiff] = useState(2);
  const [pctImbalance, setPctImbalance] = useState(100);
  const [metric, setMetric] = useState("any");

  const hiddenList = useMemo(() => [...hidden].sort(), [hidden]);

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["operational-timeline", year, month, region, hiddenList.join(",")],
    queryFn: () => getOperationalTimeline(year, month, region, hiddenList),
  });

  const days = useMemo(
    () => [...new Set(sessions.map((s) => s.start.slice(0, 10)))].sort(),
    [sessions]
  );

  const result = useMemo(
    () => buildEquilibrio(sessions, { minOverlapMin: minOverlap, minDiff, minPctImbalance: pctImbalance, metric, day }),
    [sessions, minOverlap, minDiff, pctImbalance, metric, day]
  );

  const daysCo = new Set(result.coexistence.map((x) => x.day)).size;
  const daysAlert = new Set(result.discrepancies.map((x) => x.day)).size;
  const hours = result.coexistence.reduce((n, x) => n + x.minutes, 0) / 60;

  const byDay = {};
  result.discrepancies.forEach((x) => (byDay[x.day] ??= []).push(x));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={selectClass}>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={selectClass}>
          {Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MIN + i).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select value={day} onChange={(e) => setDay(e.target.value)} className={selectClass}>
          <option value="">Todos os dias</option>
          {days.map((d) => (
            <option key={d} value={d}>{fmtDay(d)}</option>
          ))}
        </select>
        <select value={minOverlap} onChange={(e) => setMinOverlap(Number(e.target.value))} className={selectClass}>
          <option value={60}>Sobreposição mín.: 1h</option>
          <option value={120}>Sobreposição mín.: 2h</option>
          <option value={180}>Sobreposição mín.: 3h</option>
        </select>
        <select value={minDiff} onChange={(e) => setMinDiff(Number(e.target.value))} className={selectClass}>
          <option value={1}>Diferença mín.: 1 atividade</option>
          <option value={2}>Diferença mín.: 2 atividades</option>
          <option value={3}>Diferença mín.: 3 atividades</option>
        </select>
        <select value={pctImbalance} onChange={(e) => setPctImbalance(Number(e.target.value))} className={selectClass}>
          <option value={50}>Desequilíbrio: 50%</option>
          <option value={100}>Desequilíbrio: 100%</option>
          <option value={150}>Desequilíbrio: 150%</option>
          <option value={200}>Desequilíbrio: 200%</option>
        </select>
        <select value={metric} onChange={(e) => setMetric(e.target.value)} className={selectClass}>
          <option value="any">Todas as métricas</option>
          <option value="inc">Incidentes</option>
          <option value="res">Resolvidos</option>
          <option value="ci">CI's</option>
        </select>
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500">
        A comparação usa diretamente os períodos reais calculados na Timeline: um gap de até 1 hora mantém o mesmo
        período; um gap superior a 1 hora inicia um novo período.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Dias com coexistência" value={daysCo} />
        <Kpi label="Períodos comuns" value={result.coexistence.length} />
        <Kpi label="Dias sinalizados" value={daysAlert} color="#E21B23" />
        <Kpi label="Horas comuns" value={`${hours.toFixed(1)}h`} />
      </div>

      {isLoading && <p className="text-slate-500 text-sm">A carregar...</p>}

      {!isLoading && !result.discrepancies.length && (
        <p className="text-slate-500 text-sm">
          {result.coexistence.length
            ? `Existem ${result.coexistence.length} período(s) em que PT e BR trabalharam em simultâneo, mas nenhum ultrapassa os critérios de discrepância.`
            : "Não foram encontrados períodos com atividade de uma pessoa PT e uma pessoa BR em simultâneo."}
        </p>
      )}

      {Object.entries(byDay)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([dayKey, items]) => (
          <div
            key={dayKey}
            className="bg-white dark:bg-slate-900 rounded-2xl p-5 border-l-4 border-l-rose-500 border-t border-r border-b border-slate-300 dark:border-slate-800"
          >
            <h3 className="font-bold text-slate-800 dark:text-white mb-1">🚨 {fmtDay(dayKey)}</h3>
            {items.map((x, i) => (
              <div key={i} className="py-3 border-t border-slate-100 dark:border-slate-800 first:border-t-0">
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {x.a} <span className="text-slate-400 font-normal">↔</span> {x.b}
                </div>
                <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  🕒 {fmtTime(x.start)}–{fmtTime(x.end)} · {x.minutes.toFixed(0)} min juntos
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                  <b>{x.a}:</b> {x.ca.inc} Inc. · {x.ca.res} Resolvidos · {x.ca.ci} CI's
                  <br />
                  <b>{x.b}:</b> {x.cb.inc} Inc. · {x.cb.res} Resolvidos · {x.cb.ci} CI's
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {x.flags.map((f, j) => (
                    <span
                      key={j}
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400"
                    >
                      {f.label}: {f.a} vs {f.b} (dif. {f.diff})
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
