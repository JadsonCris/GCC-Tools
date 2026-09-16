// components/CentralOperacional/TimelineTab.jsx
// Timeline de turnos reais — grelha horizontal (dias x horas) com uma
// barra por período de atividade detetado (ver backend/services/
// timeline_service.py, GET /dashboard/timeline). Réplica simplificada de
// renderTimeline() do protótipo v20: mantém o essencial (posicionamento
// por pixel real, zoom, cores por equipa PT/BR) mas usa o atributo
// `title` nativo do browser como tooltip em vez de um tooltip flutuante
// próprio — muito menos código, com quase a mesma utilidade.
//
// Seletor de mês PRÓPRIO (independente do filtro de período global da
// página) — mesma decisão do protótipo original.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getOperationalTimeline } from "../../service/dashboardApi";
import { MONTHS } from "../../utils/turnosCalc";
import { Kpi } from "./shared";

const YEAR_MIN = 2026;
const YEAR_MAX = 2030;
const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const ZOOM_OPTIONS = [
  { value: 30, label: "30 px/h — compacto" },
  { value: 40, label: "40 px/h" },
  { value: 50, label: "50 px/h — normal" },
  { value: 65, label: "65 px/h — ampliado" },
  { value: 80, label: "80 px/h — máximo" },
];
const NAME_COL_WIDTH = 200;

const selectClass =
  "px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function fmtDateTime(d) {
  return d.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function TimelineTab({ region, hidden }) {
  const now = new Date();
  const [year, setYear] = useState(Math.min(Math.max(now.getFullYear(), YEAR_MIN), YEAR_MAX));
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [group, setGroup] = useState("__ALL__");
  const [pxPerHour, setPxPerHour] = useState(50);

  const hiddenList = useMemo(() => [...hidden].sort(), [hidden]);

  const { data: sessions = [], isLoading, isError } = useQuery({
    queryKey: ["operational-timeline", year, month, region, hiddenList.join(",")],
    queryFn: () => getOperationalTimeline(year, month, region, hiddenList),
  });

  const filtered = useMemo(
    () => sessions.filter((s) => group === "__ALL__" || s.team === group),
    [sessions, group]
  );
  const operators = useMemo(
    () => [...new Set(filtered.map((s) => s.tecnico))].sort((a, b) => a.localeCompare(b, "pt")),
    [filtered]
  );

  const nDays = daysInMonth(year, month);
  const dayPx = pxPerHour * 24;
  const totalW = nDays * dayPx;
  const monthStart = new Date(year, month - 1, 1).getTime();
  const totalHours = filtered.reduce((acc, s) => acc + s.duration_min, 0) / 60;

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
        <select value={group} onChange={(e) => setGroup(e.target.value)} className={selectClass}>
          <option value="__ALL__">Todos</option>
          <option value="PT">PT — Portugal</option>
          <option value="BR">BR — Brasil</option>
        </select>
        <select value={pxPerHour} onChange={(e) => setPxPerHour(Number(e.target.value))} className={selectClass}>
          {ZOOM_OPTIONS.map((z) => (
            <option key={z.value} value={z.value}>{z.label}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-5 text-xs text-slate-500 dark:text-slate-400">
        <span><span className="inline-block w-3 h-3 rounded-sm mr-1.5 align-[-2px]" style={{ background: "#bfe7ca" }} />Atividade — PT</span>
        <span><span className="inline-block w-3 h-3 rounded-sm mr-1.5 align-[-2px]" style={{ background: "#bfd8f1" }} />Atividade — BR</span>
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500">
        Cada período é inferido pelas atividades reais (abertos + resolvidos + CI's): começa na primeira ação e termina
        na última. Um intervalo de mais de 1 hora fecha o período e inicia outro.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Operadores" value={operators.length} />
        <Kpi label="Turnos / períodos" value={filtered.length} />
        <Kpi label="Horas identificadas" value={`${totalHours.toFixed(1)}h`} />
        <Kpi label="Regra de período" value="> 1h" />
      </div>

      {isLoading && <p className="text-slate-500 text-sm">A carregar...</p>}
      {isError && <p className="text-rose-500 dark:text-rose-400 text-sm">Erro ao carregar a timeline.</p>}

      {!isLoading && !isError && !filtered.length && (
        <p className="text-slate-500 text-sm">Não foram encontrados períodos de trabalho para os filtros selecionados.</p>
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <div className="border border-slate-300 dark:border-slate-800 rounded-xl overflow-auto max-h-[640px]">
          <div style={{ width: NAME_COL_WIDTH + totalW, minWidth: "100%" }}>
            <div className="flex sticky top-0 z-20" style={{ height: 40 }}>
              <div className="sticky left-0 z-30 bg-slate-800" style={{ width: NAME_COL_WIDTH }} />
              {Array.from({ length: nDays }, (_, i) => i + 1).map((d) => {
                const dt = new Date(year, month - 1, d);
                const weekend = dt.getDay() === 0 || dt.getDay() === 6;
                return (
                  <div
                    key={d}
                    className={`flex items-center justify-center border-r-2 border-slate-600 text-[11px] font-semibold text-white ${weekend ? "bg-slate-700" : "bg-slate-800"}`}
                    style={{ width: dayPx }}
                  >
                    {pad2(d)}/{pad2(month)} · {WEEKDAY_SHORT[dt.getDay()]}
                  </div>
                );
              })}
            </div>

            {operators.map((tecnico) => {
              const rows = filtered.filter((s) => s.tecnico === tecnico);
              const team = rows[0]?.team;
              const color = team === "BR" ? "#bfd8f1" : "#bfe7ca";
              return (
                <div key={tecnico} className="flex border-t border-slate-200 dark:border-slate-800" style={{ height: 44 }}>
                  <div
                    className="sticky left-0 z-10 bg-white dark:bg-slate-900 px-2 flex items-center text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap overflow-hidden text-ellipsis"
                    style={{ width: NAME_COL_WIDTH }}
                  >
                    {tecnico} <span className="ml-1 font-normal text-slate-400 dark:text-slate-500">({team})</span>
                  </div>
                  <div className="relative bg-slate-50 dark:bg-slate-950/40" style={{ width: totalW, height: 44 }}>
                    {rows.map((s, i) => {
                      const start = new Date(s.start);
                      const end = new Date(s.end);
                      const left = ((start.getTime() - monthStart) / 86400000) * dayPx;
                      const right = ((end.getTime() - monthStart) / 86400000) * dayPx;
                      const width = Math.max(4, right - left);
                      return (
                        <div
                          key={i}
                          title={`${tecnico}\nTurno: ${s.shift}\n${fmtDateTime(start)} → ${fmtDateTime(end)}\nIncidentes: ${s.inc} · Resolvidos: ${s.res} · CI's: ${s.ci}`}
                          className="absolute rounded-md border border-black/10 hover:brightness-95 cursor-help"
                          style={{ left, width, top: 6, height: 32, background: color }}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
