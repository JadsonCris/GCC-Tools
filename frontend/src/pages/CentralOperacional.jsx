import { useQuery } from "@tanstack/react-query";
import { getRangeSummary } from "../service/dashboardApi";
import { useDateRange } from "../context/DateRangeContext.jsx";
import DateRangeFilter from "../components/Filters/DateRangeFilter";
import KPICard from "../components/KPI/KPICard";
import PriorityBarChartMui from "../components/Charts/PriorityBarChartMui";
import ToolsPieChartMui from "../components/Charts/ToolsPieChartMui";
import SourceByDayTable from "../components/Tables/SourceByDayTable";
import TeamActivityTable from "../components/Tables/TeamActivityTable";

export default function CentralOperacional() {
  const { range, region } = useDateRange();

  const { data: summary, isLoading } = useQuery({
    queryKey: ["range-summary", range?.start, range?.end, region],
    queryFn: () => getRangeSummary(range.start, range.end, region),
    enabled: !!range,
  });

  const incidents = summary?.incidents_summary;
  const tools = summary?.tools_breakdown;
  const quality = summary?.quality_metrics;
  const loadingIncidents = isLoading;
  const loadingTools = isLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Central Operacional</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Incidentes ativos, ferramentas, canal de abertura e performance da equipa — tudo num só lugar.
        </p>
      </div>

      <DateRangeFilter />

      {/* Canal de abertura (Automático / Manual / Justificações) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard title="Canal Automático (AIOPER)" value={quality?.ai_incidentes ?? 0} color="text-cyan-500 dark:text-cyan-400" />
        <KPICard title="Operação Manual" value={quality?.manual_incidentes ?? 0} color="text-slate-600 dark:text-slate-300" />
        <KPICard title="Justificações Aceites" value={quality?.justificados ?? 0} color="text-emerald-500 dark:text-emerald-400" />
      </div>

      {/* Incidentes por Prioridade + Ferramentas */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-300 dark:border-slate-800">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-slate-800 dark:text-white font-semibold">Incidentes Ativos por Prioridade</h3>
            {incidents && <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">Total: {incidents.total}</span>}
          </div>
          {loadingIncidents && <p className="text-slate-500 text-sm">Carregando...</p>}
          {!loadingIncidents && <PriorityBarChartMui data={incidents?.bars ?? []} />}
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-300 dark:border-slate-800">
          <h3 className="text-slate-800 dark:text-white font-semibold mb-6">Status de Ferramentas</h3>
          {loadingTools && <p className="text-slate-500 text-sm">Carregando...</p>}
          {!loadingTools && <ToolsPieChartMui data={tools ?? []} />}
        </div>
      </div>

      {/* Incidentes por Fonte e Dia */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-300 dark:border-slate-800">
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">Incidentes por Fonte e Dia</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-4">
          Quantidade de incidentes abertos por cada fonte/ferramenta, dia a dia.
        </p>
        {isLoading && <p className="text-slate-500 text-sm">Carregando...</p>}
        {!isLoading && <SourceByDayTable data={summary?.source_by_day} />}
      </div>

      {/* Incidentes Abertos + Tags OK por Técnico */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-300 dark:border-slate-800">
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">Atividade da Equipa</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-4">
          Incidentes abertos e tags OK feitas por cada técnico, no período selecionado.
        </p>
        {isLoading && <p className="text-slate-500 text-sm">Carregando...</p>}
        {!isLoading && <TeamActivityTable data={summary?.team_activity} />}
      </div>
    </div>
  );
}
