// components/Tables/OperatorsTable.jsx
export default function OperatorsTable({ data = [], onRowClick, variant = "sla" }) {
  const showSla = variant === "sla";
  const showNok = variant === "nok";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-300 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">
            <th className="pb-3 pr-4">Técnico</th>
            <th className="pb-3 px-4 text-center">Nº de Incidentes</th>
            {showSla && <th className="pb-3 px-4 w-44">Cumprimento SLA</th>}
            {showNok && <th className="pb-3 px-4 text-center">Nº de NOK</th>}
            {showNok && <th className="pb-3 px-4 text-center">% de NOK</th>}
            <th className="pb-3 pl-4 text-right">Tempo Médio</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
          {data.map((agent, index) => {
            const isGoodSla = agent.sla >= 70;
            const isBadNok = agent.nok_pct >= 15;
            return (
              <tr
                key={index}
                onClick={onRowClick ? () => onRowClick(agent.name) : undefined}
                className={`text-slate-700 dark:text-slate-200 ${onRowClick ? "hover:bg-slate-100 dark:hover:bg-slate-800/20 transition-colors cursor-pointer" : ""}`}
              >
                <td className="py-3 pr-4 font-medium hover:text-blue-500 dark:hover:text-blue-400 transition-colors">{agent.name}</td>
                <td className="py-3 px-4 text-center text-slate-600 dark:text-slate-300 font-bold">{agent.inc}</td>
                {showSla && (
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-full bg-slate-100 dark:bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-300 dark:border-slate-800">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${isGoodSla ? "bg-emerald-400" : "bg-rose-500"}`}
                          style={{ width: `${agent.sla}%` }}
                        />
                      </div>
                      <span className={`text-xs font-bold font-mono shrink-0 ${isGoodSla ? "text-emerald-500 dark:text-emerald-400" : "text-rose-600 dark:text-rose-500"}`}>
                        {agent.sla}%
                      </span>
                    </div>
                  </td>
                )}
                {showNok && <td className="py-3 px-4 text-center text-slate-600 dark:text-slate-300">{agent.nok}</td>}
                {showNok && (
                  <td className={`py-3 px-4 text-center font-bold ${isBadNok ? "text-rose-600 dark:text-rose-500" : "text-emerald-500 dark:text-emerald-400"}`}>
                    {agent.nok_pct}%
                  </td>
                )}
                <td className="py-3 pl-4 text-blue-500 dark:text-blue-400 font-mono text-right">{agent.time}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
