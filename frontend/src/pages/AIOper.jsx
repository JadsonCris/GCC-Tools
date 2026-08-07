import { useQuery } from "@tanstack/react-query";
import { getRangeSummary } from "../service/dashboardApi";
import KPICard from "../components/KPI/KPICard";
import PriorityChart from "../components/Charts/PriorityChart";
import ToolChart from "../components/Charts/ToolChart";
import GrupoSplitBar from "../components/Charts/GrupoSplitBar";
import DateRangeFilter from "../components/Filters/DateRangeFilter";
import { useDateRange } from "../context/DateRangeContext.jsx";

export default function AIOper() {
  const { range, region } = useDateRange();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["range-summary", range?.start, range?.end, region],
    queryFn: () => getRangeSummary(range.start, range.end, region),
    enabled: !!range,
  });

  const aioper = data?.aioper_summary;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">AIOPER</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Incidentes abertos por automação (contas AIOPS) — separados da Operação e Monitorização.
        </p>
      </div>

      <DateRangeFilter />

      {isLoading && <p className="text-slate-500">Carregando dados do AIOPER...</p>}
      {isError && <p className="text-rose-500 dark:text-rose-400">Erro ao carregar dados do backend.</p>}

      {aioper && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KPICard title="Total Incidentes AIOPER" value={aioper.total_incidentes} color="text-blue-500 dark:text-blue-400" />
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-300 dark:border-slate-800">
            <h3 className="text-slate-800 dark:text-white font-semibold mb-6">AIOPER vs Monitorização vs Operação</h3>
            <GrupoSplitBar data={aioper.grupo_breakdown} />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-300 dark:border-slate-800">
              <h3 className="text-slate-800 dark:text-white font-semibold mb-6">Incidentes Abertos por Prioridade (AIOPER)</h3>
              <PriorityChart data={aioper.priority_breakdown} />
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-300 dark:border-slate-800">
              <h3 className="text-slate-800 dark:text-white font-semibold mb-6">Incidentes Abertos por Ferramenta (AIOPER)</h3>
              <ToolChart data={aioper.tools_breakdown} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
