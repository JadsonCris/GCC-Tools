import { useQuery } from "@tanstack/react-query";
import { getIncidentsSummary } from "../service/dashboardApi";

export default function Incidents() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["incidents-summary"],
    queryFn: getIncidentsSummary,
  });

  const bars = data?.bars ?? [];
  const totalIncidents = data?.total ?? 0;
  const maxVal = Math.max(...bars.map((b) => b.val), 0) || 1;

  return (
      <div className="bg-slate-900 rounded-2xl p-8 border border-slate-800">
        <h1 className="text-2xl font-bold text-white">Incidentes</h1>
        <p className="mt-4 text-slate-400">Resumo de incidentes do ServiceNow.</p>

        {isLoading && <p className="mt-8 text-slate-500">Carregando...</p>}
        {isError && <p className="mt-8 text-rose-400">Erro ao carregar dados do backend.</p>}

        {!isLoading && !isError && (
          <>
            <div className="flex items-end justify-between gap-1.5 h-44 px-2 border-b border-slate-800/80 pb-1">
              {bars.map((bar, index) => {
                const heightPct = maxVal > 0
                  ? Math.max((bar.val / maxVal) * 130, bar.val > 0 ? 8 : 3)
                  : 3;
                const isZero = bar.val === 0;

                return (
                  <div key={index} className="flex flex-col items-center flex-1 h-full justify-end group">
                    <div className="text-xs font-mono mb-1 h-4" style={{ color: bar.color }}>
                      {bar.val || ""}
                    </div>
                    <div
                      className="w-full rounded-t-sm transition-all duration-500"
                      style={{
                        height: `${heightPct}px`,
                        opacity: isZero ? 0.2 : 1,
                        backgroundColor: bar.color,
                      }}
                    />
                    <div className="text-[10px] text-slate-600 font-mono mt-1 h-4 truncate">
                      {bar.label}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-xs font-mono">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-500 text-[11px]">
                {bars.map((bar, index) => (
                  <div key={index} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: bar.color }} />
                    <span>{bar.legend}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-baseline gap-2 self-end sm:self-auto">
                <span className="text-slate-500 text-[11px]">Total</span>
                <span className="text-2xl font-black text-white tracking-wide font-sans">
                  {totalIncidents}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
  );
}
