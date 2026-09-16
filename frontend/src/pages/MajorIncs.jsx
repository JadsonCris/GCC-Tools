// pages/MajorIncs.jsx
// "Major Incs": incidentes P1 (tratados vs despromovidos) + Calls do
// GCC — réplica adaptada dos exemplos fornecidos (dashboard Power BI
// original), consumindo o histórico real na BD em vez de ficheiros
// carregados à mão. Ver backend/services/major_incs_service.py pra
// definição exata de cada métrica.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMajorIncs } from "../service/dashboardApi";
import { useDateRange } from "../context/DateRangeContext.jsx";
import DateRangeFilter from "../components/Filters/DateRangeFilter";
import GranularityToggle from "../components/Filters/GranularityToggle";
import TrendChart from "../components/Charts/TrendChart";
import SimplePieChart from "../components/Charts/SimplePieChart";
import { aggregateByGranularity } from "../utils/trendGranularity";

// Mesma paleta usada no backend (major_incs_service.CALL_CATEGORY_COLORS)
// — "Change"/"Problem" aparecem no pie de Prioridade porque esses
// registos não têm prioridade própria (ver _priority_or_type).
const CALL_CATEGORY_COLORS = {
  P1: "#E21B23", P2: "#FAB138", P3: "#F9E33B", P4: "#30ADDE",
  Change: "#2B6CB0", Problem: "#212E3E",
};

function fmtHms(totalSeconds) {
  const s = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

function Kpi({ label, value, color }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-300 dark:border-slate-800 text-center">
      <div className="text-4xl font-black" style={{ color }}>{value}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400 uppercase font-medium mt-2">{label}</div>
    </div>
  );
}

function Panel({ title, subtitle, actions, children }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-300 dark:border-slate-800">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-slate-800 dark:text-white font-semibold">{title}</h3>
        {actions}
      </div>
      {subtitle && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </div>
  );
}

function IncidentListTable({ rows }) {
  if (!rows.length) {
    return <p className="text-slate-500 text-sm">Sem incidentes no período selecionado.</p>;
  }
  return (
    <div className="overflow-x-auto max-h-96 overflow-y-auto">
      <table className="w-full text-left border-collapse text-sm">
        <thead className="sticky top-0 bg-white dark:bg-slate-900">
          <tr className="border-b border-slate-300 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">
            <th className="py-2 pr-3">Número</th>
            <th className="py-2 px-3">Data</th>
            <th className="py-2 px-3">Canal</th>
            <th className="py-2 px-3">Geo</th>
            <th className="py-2 pl-3">Descrição</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
          {rows.map((r) => (
            <tr key={r.number}>
              <td className="py-2 pr-3 font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">{r.number}</td>
              <td className="py-2 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{r.date ?? "—"}</td>
              <td className="py-2 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{r.canal ?? "—"}</td>
              <td className="py-2 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{r.geo ?? "—"}</td>
              <td className="py-2 pl-3 text-slate-600 dark:text-slate-300 max-w-xs truncate" title={r.short_description}>
                {r.short_description || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MajorIncs() {
  const { range, region } = useDateRange();

  const { data, isLoading } = useQuery({
    queryKey: ["major-incs", range?.start, range?.end, region],
    queryFn: () => getMajorIncs(range.start, range.end, region),
    enabled: !!range,
  });

  const desp = data?.despromovidos;
  const calls = data?.calls;

  // Dia/Mês/Ano por gráfico (ver utils/trendGranularity) — o backend
  // manda sempre por dia, sem buracos (todo dia do período, mesmo sem
  // dado — ver major_incs_service._all_days_between); agregar pra
  // mês/ano é só somar essa série já contínua, feito aqui no frontend.
  const [despGranularity, setDespGranularity] = useState("mes");
  const [callsGranularity, setCallsGranularity] = useState("mes");
  const [duracaoGranularity, setDuracaoGranularity] = useState("mes");

  const priorityColorSeries = (calls?.priority_keys ?? []).map((key) => ({
    dataKey: key,
    label: key,
    color: CALL_CATEGORY_COLORS[key] || "#94a3b8",
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Major Incs</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Incidentes P1 (tratados vs despromovidos) e Calls do GCC, no período selecionado.
        </p>
      </div>

      <DateRangeFilter />

      {isLoading && <p className="text-slate-500 text-sm">Carregando...</p>}

      {!isLoading && (
        <>
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">P1's Despromovidos</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Kpi label="Total de Incidentes Tratados Como P1" value={desp?.tratados_count ?? 0} color="#E21B23" />
              <Kpi
                label="Total de Incidentes Abertos Como P1 Que Foram Despromovidos"
                value={desp?.despromovidos_count ?? 0}
                color="#FAB138"
              />
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <Panel title="Incidentes Tratados Como P1">
                <IncidentListTable rows={desp?.tratados ?? []} />
              </Panel>
              <Panel title="Incidentes Despromovidos">
                <IncidentListTable rows={desp?.despromovidos ?? []} />
              </Panel>
            </div>

            <Panel title="Evolução Diária" actions={<GranularityToggle value={despGranularity} onChange={setDespGranularity} />}>
              <TrendChart
                data={aggregateByGranularity(desp?.daily ?? [], despGranularity, ["tratados", "despromovidos"])}
                type="bar"
                xKey="date"
                height={340}
                groupedDateAxis={despGranularity === "dia"}
                series={[
                  { dataKey: "tratados", label: "Tratados Como P1", color: "#E21B23" },
                  { dataKey: "despromovidos", label: "Despromovidos", color: "#FAB138" },
                ]}
              />
            </Panel>
          </div>

          <div className="space-y-6">
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">Calls</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Kpi label="Total de Calls" value={calls?.total_calls ?? 0} color="#4f7fff" />
              <Kpi label="Total de Tempo em Call" value={calls?.total_tempo ?? "00:00:00"} color="#0FA811" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <Panel title="Geografia">
                <SimplePieChart data={calls?.geografia ?? []} />
              </Panel>
              <Panel title="Prioridade">
                <SimplePieChart data={calls?.prioridade ?? []} colors={CALL_CATEGORY_COLORS} />
              </Panel>
              <Panel title="Motivo">
                <SimplePieChart data={calls?.motivo ?? []} />
              </Panel>
              <Panel title="Tipo">
                <SimplePieChart data={calls?.tipo ?? []} />
              </Panel>
            </div>

            <Panel
              title="Total de Calls"
              subtitle="Por prioridade"
              actions={<GranularityToggle value={callsGranularity} onChange={setCallsGranularity} />}
            >
              <TrendChart
                data={aggregateByGranularity(calls?.daily_calls ?? [], callsGranularity, calls?.priority_keys ?? [])}
                type="bar"
                xKey="date"
                height={340}
                groupedDateAxis={callsGranularity === "dia"}
                series={priorityColorSeries}
              />
            </Panel>

            <Panel
              title="Total de Tempo em Call"
              actions={<GranularityToggle value={duracaoGranularity} onChange={setDuracaoGranularity} />}
            >
              <TrendChart
                data={aggregateByGranularity(calls?.daily_duracao ?? [], duracaoGranularity, ["segundos"])}
                type="line"
                xKey="date"
                height={340}
                groupedDateAxis={duracaoGranularity === "dia"}
                series={[{ dataKey: "segundos", label: "Tempo em Call", color: "#4f7fff" }]}
                valueFormatter={fmtHms}
              />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
