// components/Charts/ToolChart.jsx
export default function ToolChart({ data = [] }) {
  const total = data.reduce((s, d) => s + d.val, 0);
  const r = 15.9155;
  const circ = 2 * Math.PI * r;

  let currentOffset = 0;

  if (!data.length) {
    return <p className="text-slate-500 text-sm">Sem dados disponíveis.</p>;
  }

  return (
    <div className="flex flex-col sm:flex-row items-center gap-8">
      <div className="w-40 h-40 flex-shrink-0">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          {data.map((d, index) => {
            const dash = total > 0 ? (d.val / total) * circ : 0;
            const strokeDashoffset = -currentOffset;
            currentOffset += dash;

            return (
              <circle
                key={index}
                cx="18"
                cy="18"
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth="3.5"
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeDashoffset={strokeDashoffset}
              />
            );
          })}
        </svg>
      </div>

      <div className="flex-1 grid grid-cols-1 gap-2 w-full">
        {data.map((d, index) => (
          <div
            key={index}
            className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-300 bg-slate-100/50 dark:bg-slate-950/50 px-3 py-2 rounded-lg border border-slate-200/60 dark:border-slate-800/60"
          >
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
              <span className="font-medium text-slate-800 dark:text-slate-200">{d.name}</span>
            </div>
            <span className="text-xs font-bold bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-400">
              {d.val}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
