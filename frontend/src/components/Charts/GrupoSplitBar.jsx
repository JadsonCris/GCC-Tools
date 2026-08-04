// components/Charts/GrupoSplitBar.jsx
const GRUPO_COLORS = {
  AIOPER: "#4f7fff",
  "Monitorização": "#00e5a0",
  "Operação": "#ffb84f",
};

export default function GrupoSplitBar({ data = [] }) {
  if (!data.length) {
    return <p className="text-slate-500 text-sm">Sem dados disponíveis.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="w-full h-8 rounded-lg overflow-hidden flex border border-slate-300 dark:border-slate-800">
        {data.map((d, index) => (
          <div
            key={index}
            style={{ width: `${d.pct}%`, backgroundColor: GRUPO_COLORS[d.grupo] || "#94a3b8" }}
            className="h-full flex items-center justify-center text-[10px] font-bold text-white dark:text-slate-950"
          >
            {d.pct >= 8 ? `${d.pct}%` : ""}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-4">
        {data.map((d, index) => (
          <div key={index} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: GRUPO_COLORS[d.grupo] || "#94a3b8" }} />
            <span className="font-medium">{d.grupo}</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              ({d.val} · {d.pct}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
