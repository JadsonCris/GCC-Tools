import { useQuery } from "@tanstack/react-query";
import { getToolsBreakdown } from "../service/dashboardApi";

export default function Tools() {
  const { data: tools = [], isLoading, isError } = useQuery({
    queryKey: ["tools-breakdown"],
    queryFn: getToolsBreakdown,
  });

  const total = tools.reduce((s, t) => s + t.val, 0);
  const r = 15.9155;
  const circ = 2 * Math.PI * r;

  let currentOffset = 0;

  return (
      <div className="bg-slate-900 rounded-2xl p-8 border border-slate-800">
        <h1 className="text-2xl font-bold text-white">Ferramentas</h1>
        <p className="mt-4 text-slate-400">Visão geral das ferramentas usadas no processo.</p>

        {isLoading && <p className="mt-8 text-slate-500">Carregando...</p>}
        {isError && <p className="mt-8 text-rose-400">Erro ao carregar dados do backend.</p>}

        {!isLoading && !isError && (
          <div className="mt-8 flex flex-col sm:flex-row items-center gap-8 bg-slate-950 p-6 rounded-xl border border-slate-800">
            <div className="w-48 h-48 flex-shrink-0">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                {tools.map((t, index) => {
                  const dash = total > 0 ? (t.val / total) * circ : 0;
                  const strokeDashoffset = -currentOffset;
                  currentOffset += dash;

                  return (
                    <circle
                      key={index}
                      cx="18"
                      cy="18"
                      r={r}
                      fill="none"
                      stroke={t.color}
                      strokeWidth="3.5"
                      strokeDasharray={`${dash} ${circ - dash}`}
                      strokeDashoffset={strokeDashoffset}
                    />
                  );
                })}
              </svg>
            </div>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
              {tools.map((t, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between text-sm text-slate-300 bg-slate-900/50 px-3 py-2 rounded-lg border border-slate-800/60"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: t.color }}
                    />
                    <span className="font-medium text-slate-200">{t.name}</span>
                  </div>
                  <span className="text-xs font-bold bg-slate-800 px-2 py-0.5 rounded text-slate-400">
                    {t.val}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
  );
}
