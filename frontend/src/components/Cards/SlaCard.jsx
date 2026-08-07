// components/Cards/SlaCard.jsx
export default function SlaCard({
  title,
  targetLabel,
  value,
  valueSuffix = "",
  isMet,
  subMetrics = [],
  pending = false,
  note,
}) {
  const gridColsClass =
    subMetrics.length === 3 ? "grid-cols-3" : subMetrics.length === 2 ? "grid-cols-2" : "grid-cols-1";

  const valueColor = pending ? "text-slate-400 dark:text-slate-300" : isMet ? "text-emerald-500 dark:text-emerald-400" : "text-amber-600 dark:text-amber-500";

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 p-6 rounded-xl shadow-md flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-start">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{title}</span>
          <span className="text-xs text-slate-400 dark:text-slate-500">{targetLabel}</span>
        </div>

        <div className="flex items-baseline gap-2 mt-4">
          <span className={`text-4xl font-black tracking-tight ${valueColor}`}>
            {value}
            {valueSuffix}
          </span>
          {pending && <span className="text-xs text-slate-400 dark:text-slate-500">{note || "(pendente de validação)"}</span>}
        </div>

        {subMetrics.length > 0 && (
          <div className={`grid ${gridColsClass} gap-2 mt-6 pt-4 border-t border-slate-300 dark:border-slate-800/60 text-center`}>
            {subMetrics.map((m, i) => {
              // m.color pode ser uma classe Tailwind (ex: "text-emerald-400")
              // ou uma cor hex de marca (ex: "#0FA811") — usa style inline
              // só quando for hex, pra não depender do Tailwind gerar essas
              // classes dinamicamente (que ele não faz).
              const isHex = m.color?.startsWith("#");
              return (
                <div key={i}>
                  <div
                    className={`text-xl font-bold ${isHex ? "" : m.color || "text-slate-800 dark:text-white"}`}
                    style={isHex ? { color: m.color } : undefined}
                  >
                    {m.value}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-medium mt-1">{m.label}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
