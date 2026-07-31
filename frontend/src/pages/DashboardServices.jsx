import { useQuery } from "@tanstack/react-query";
import KPICard from "../components/KPI/KPICard";
import PriorityChart from "../components/Charts/PriorityChart";
import ToolChart from "../components/Charts/ToolChart";
import { 
  getKPIs, 
  getPriorityBreakdown, 
  getToolsBreakdown, 
  getQualityMetrics, 
  getBacklogSummary 
} from "../service/dashboardApi";

export default function DashboardServices() {
  const { data: kpis, isLoading: loadingKpis } = useQuery({ queryKey: ["kpis"], queryFn: getKPIs });
  const { data: priority } = useQuery({ queryKey: ["priority-breakdown"], queryFn: getPriorityBreakdown });
  const { data: tools } = useQuery({ queryKey: ["tools-breakdown"], queryFn: getToolsBreakdown });
  const { data: quality } = useQuery({ queryKey: ["quality"], queryFn: getQualityMetrics });
  const { data: backlog } = useQuery({ queryKey: ["backlog"], queryFn: getBacklogSummary });

  const loading = loadingKpis;

  return (
    <div className="space-y-6">
      {/* Bloco Principal de Volume */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Total Incidentes" value={loading ? "..." : kpis?.total_incidentes} color="text-blue-400" />
        <KPICard title="P1 Ativos" value={loading ? "..." : kpis?.p1_ativos} color="text-red-400" />
        <KPICard title="SLA Global" value={loading ? "..." : `${kpis?.sla}%`} color="text-green-400" />
        <KPICard title="Backlog Total (INC+RITM)" value={loading ? "..." : backlog?.backlog_total} color="text-rose-500 font-bold" />
      </div>

      {/* Bloco de Qualidade e Operações */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Registos Conformes (OK)" value={loading ? "..." : quality?.ok_count} color="text-emerald-400" />
        <KPICard title="Não Conformes (NOK)" value={loading ? "..." : quality?.nok_count} color="text-amber-500" />
        <KPICard title="Incidentes por IA / SCOM" value={loading ? "..." : quality?.ai_incidentes} color="text-cyan-400" />
        <KPICard title="Tratamento Manual" value={loading ? "..." : quality?.manual_incidentes} color="text-slate-300" />
      </div>

      {/* Bloco de Auditoria Avançada */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Justificações Submetidas" value={loading ? "..." : quality?.justificados} color="text-indigo-400" />
        <KPICard title="Taxa de Automação" value={loading ? "..." : `${quality?.taxa_automacao}%`} color="text-teal-400" />
        <KPICard title="Backlog Incidentes" value={loading ? "..." : backlog?.backlog_incidentes} color="text-purple-400" />
        <KPICard title="Backlog RITM" value={loading ? "..." : backlog?.backlog_ritm} color="text-pink-400" />
      </div>

      {/* Gráficos Originais Mantidos */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800">
          <h3 className="text-white font-semibold mb-6">Incidentes por Prioridade</h3>
          <PriorityChart data={priority} />
        </div>
        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800">
          <h3 className="text-white font-semibold mb-6">Falhas por Ferramenta</h3>
          <ToolChart data={tools} />
        </div>
      </div>
    </div>
  );
}