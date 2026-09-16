// components/Filters/GranularityToggle.jsx
import { GRANULARITY_OPTIONS } from "../../utils/trendGranularity";

// Dia/Mês/Ano — usado nos gráficos "por dia" (Evolução Diária, Total de
// Calls, Total de Tempo em Call, em Major Incs) pra escolher o nível de
// agregação (ver utils/trendGranularity.aggregateByGranularity).
export default function GranularityToggle({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {GRANULARITY_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
            value === o.value
              ? "bg-emerald-500 border-emerald-500 text-white"
              : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-400"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
