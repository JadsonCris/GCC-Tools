import { useQuery } from "@tanstack/react-query";
import { getOperatorsSummary } from "../service/dashboardApi";

export default function Operators() {
  const { data: agents = [], isLoading, isError } = useQuery({
    queryKey: ["operators-summary"],
    queryFn: getOperatorsSummary,
  });

  return (
    <div className="bg-slate-900 rounded-2xl p-8 border border-slate-800">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Performance de Operadores</h1>
          <p className="text-sm text-slate-400 mt-1">Volume de incidentes e cumprimento de SLA por operador.</p>
        </div>
        <span className="bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-mono text-slate-400">
          Total Operadores Ativos: {agents.length}
        </span>
      </div>

      {isLoading && <p className="text-slate-500">A calcular performance de equipas...</p>}
      {isError && <p className="text-rose-400">Erro na comunicação com a API analítica.</p>}

      {!isLoading && !isError && (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider font-semibold">
                <th className="pb-3 pr-4">Operador / Equipa</th>
                <th className="pb-3 px-4 text-center">INC Total</th>
                <th className="pb-3 px-4 w-44">Cumprimento SLA</th>
                <th className="pb-3 pl-4 text-right">Tempo Médio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {agents.map((agent, index) => {
                const isGoodSla = agent.sla >= 70;

                return (
                  <tr key={index} className="hover:bg-slate-800/20 transition-colors text-sm">
                    <td className="py-4 pr-4 text-slate-200 font-medium">{agent.name}</td>
                    <td className="py-4 px-4 text-center text-slate-300 font-bold">{agent.inc}</td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isGoodSla ? "bg-emerald-400" : "bg-rose-500"
                            }`}
                            style={{ width: `${agent.sla}%` }}
                          />
                        </div>
                        <span className={`text-xs font-bold font-mono shrink-0 ${isGoodSla ? "text-emerald-400" : "text-rose-500"}`}>
                          {agent.sla}%
                        </span>
                      </div>
                    </td>
                    <td className="py-4 pl-4 text-blue-400 font-mono text-right">{agent.time}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-xs text-slate-600 mt-4">
            Nota: o backend ainda não tem uma medida DAX confirmada para "PTS" nem para
            breakdown IA/Manual/Justificado por operador individual — por isso essas
            colunas foram removidas em vez de mostrar números estimados.
          </p>
        </div>
      )}
    </div>
  );
}
