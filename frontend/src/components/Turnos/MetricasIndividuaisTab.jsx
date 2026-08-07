// components/Turnos/MetricasIndividuaisTab.jsx
import { useState } from "react";
import { BarChart } from "@mui/x-charts/BarChart";
import { useTheme } from "@mui/material/styles";
import BarValueLabels from "../Charts/BarValueLabels";
import { METRICS, MONTHS, MONTHS_SHORT, computeEmployeeMonth } from "../../utils/turnosCalc";

const SERIES = [{ dataKey: "value", label: "Valor" }];

export default function MetricasIndividuaisTab({ employees, yearShifts, year }) {
  const theme = useTheme();
  const visible = employees.filter((e) => !e.hidden);
  const [empId, setEmpId] = useState(visible[0]?.id ?? "");
  const [metricKey, setMetricKey] = useState("worked");

  const emp = visible.find((e) => e.id === Number(empId)) || visible[0];
  const metric = METRICS.find((m) => m.key === metricKey) || METRICS[0];
  const suffix = metricKey === "night" ? "h" : "";
  const dm = emp ? yearShifts[String(emp.id)] || {} : {};

  const data = Array.from({ length: 12 }, (_, i) => {
    const stats = computeEmployeeMonth(dm, year, i + 1);
    return { month: MONTHS_SHORT[i], value: stats[metricKey] || 0 };
  });

  const total = data.reduce((a, d) => a + d.value, 0);
  const avg = (total / 12).toFixed(1);
  const bestIndex = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  const maxValue = Math.max(0, ...data.map((d) => d.value));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 items-center bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl p-4">
        <label className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
          Operador:
          <select
            value={emp?.id ?? ""}
            onChange={(e) => setEmpId(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm font-normal"
          >
            {visible.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
          Métrica:
          <select
            value={metricKey}
            onChange={(e) => setMetricKey(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm font-normal"
          >
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </label>
      </div>

      {!emp && <p className="text-slate-500 text-sm">Não existem operadores visíveis para analisar.</p>}

      {emp && (
        <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-6">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-4">
            {emp.name} — {metric.label} em {year}
          </h2>
          <div className="flex flex-wrap gap-3 mb-4">
            <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 px-3 py-1.5 rounded-full text-xs font-bold">
              Total: {total}{suffix}
            </span>
            <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 px-3 py-1.5 rounded-full text-xs font-bold">
              Média mensal: {avg}{suffix}
            </span>
            <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 px-3 py-1.5 rounded-full text-xs font-bold">
              Mês mais alto: {MONTHS[bestIndex]} ({data[bestIndex].value}{suffix})
            </span>
          </div>

          <BarChart
            height={300}
            dataset={data}
            xAxis={[{ scaleType: "band", dataKey: "month", tickLabelStyle: { fill: theme.palette.text.secondary } }]}
            yAxis={[{ tickLabelStyle: { fill: theme.palette.text.secondary }, max: maxValue > 0 ? maxValue * 1.15 : 1 }]}
            series={SERIES}
            grid={{ horizontal: true }}
            margin={{ top: 24 }}
            sx={{
              "& .MuiChartsAxis-line, & .MuiChartsAxis-tick": { stroke: theme.palette.divider },
              "& .MuiChartsGrid-line": { stroke: theme.palette.divider },
              "& .MuiBarElement-root": { fill: "#212E5E" },
            }}
            slotProps={{ legend: { hidden: true } }}
          >
            <BarValueLabels data={data} series={SERIES} categoryKey="month" />
          </BarChart>

          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
            Evolução mensal da métrica selecionada para o ano {year}.
          </p>
        </div>
      )}
    </div>
  );
}
