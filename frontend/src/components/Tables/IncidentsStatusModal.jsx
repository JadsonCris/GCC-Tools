// components/Tables/IncidentsStatusModal.jsx
// Tabela de incidentes por trás de um card de status SLA (Cumprido/
// Falhado/Justificado) do Report SLaAs — abre ao clicar no card
// correspondente em SlaDetailSection.jsx.
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { getIncidentsByStatus } from "../../service/dashboardApi";

const STATUS_LABELS = { ok: "SLA Cumprido", nok: "SLA Falhado", justificados: "Justificado" };

export default function IncidentsStatusModal({ status, range, region, onClose }) {
  const { data = [], isLoading, isError } = useQuery({
    queryKey: ["incidents-by-status", status, range?.start, range?.end, region],
    queryFn: () => getIncidentsByStatus(status, range.start, range.end, region),
    enabled: !!status && !!range,
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">{STATUS_LABELS[status] ?? status}</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {isLoading ? "A carregar..." : `${data.length} incidente(s) no período selecionado`}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
            <X size={22} />
          </button>
        </div>

        {isLoading && <p className="text-slate-500 text-sm">A carregar incidentes...</p>}
        {isError && <p className="text-rose-500 dark:text-rose-400 text-sm">Erro ao carregar incidentes.</p>}

        {!isLoading && !isError && data.length === 0 && (
          <p className="text-slate-500 text-sm">Sem incidentes neste status, no período/geografia selecionados.</p>
        )}

        {!isLoading && !isError && data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-300 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">
                  <th className="pb-3 pr-4">Nº</th>
                  <th className="pb-3 pr-4">Descrição</th>
                  <th className="pb-3 pr-4">Prioridade</th>
                  <th className="pb-3 pr-4">Técnico</th>
                  <th className="pb-3 pr-4">Região</th>
                  <th className="pb-3 pr-4">Aberto em</th>
                  <th className="pb-3 pl-4 text-center">SLA1 (min)</th>
                  {status === "justificados" && <th className="pb-3 pl-4">Justificação</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
                {data.map((inc) => (
                  <tr key={inc.number}>
                    <td className="py-3 pr-4 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">{inc.number}</td>
                    <td className="py-3 pr-4 text-slate-700 dark:text-slate-200 max-w-xs truncate" title={inc.description}>
                      {inc.description}
                    </td>
                    <td className="py-3 pr-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">{inc.priority}</td>
                    <td className="py-3 pr-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">{inc.tecnico}</td>
                    <td className="py-3 pr-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">{inc.region}</td>
                    <td className="py-3 pr-4 text-slate-400 font-mono text-xs whitespace-nowrap">{inc.opened_at}</td>
                    <td className="py-3 pl-4 text-center font-mono text-slate-600 dark:text-slate-300">{inc.sla1_minutes ?? "—"}</td>
                    {status === "justificados" && (
                      <td className="py-3 pl-4 text-slate-600 dark:text-slate-300 max-w-sm" title={inc.justificacao}>
                        {inc.justificacao || "—"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
