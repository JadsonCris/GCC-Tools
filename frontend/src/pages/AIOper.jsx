import { useQuery } from "@tanstack/react-query";
import { getRangeSummary, getAioperTrend } from "../service/dashboardApi";
import KPICard from "../components/KPI/KPICard";
import PriorityChart from "../components/Charts/PriorityChart";
import ToolChart from "../components/Charts/ToolChart";
import GrupoSplitBar from "../components/Charts/GrupoSplitBar";
import TrendChart from "../components/Charts/TrendChart";
import GroupedMonthlyTable from "../components/Tables/GroupedMonthlyTable";
import DateRangeFilter from "../components/Filters/DateRangeFilter";
import { useDateRange } from "../context/DateRangeContext.jsx";
import { minutesToHms } from "../utils/formatTime";

function Panel({ title, subtitle, children }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-300 dark:border-slate-800">
      <h3 className="text-slate-800 dark:text-white font-semibold">{title}</h3>
      {subtitle && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </div>
  );
}

export default function AIOper() {
  const { range, region } = useDateRange();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["range-summary", range?.start, range?.end, region],
    queryFn: () => getRangeSummary(range.start, range.end, region),
    enabled: !!range,
  });

  const { data: trend = [], isLoading: loadingTrend, isError: errorTrend } = useQuery({
    queryKey: ["aioper-trend", range?.start, range?.end, region],
    queryFn: () => getAioperTrend(range.start, range.end, region),
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

          {/* SLA1/SLA2/Prioridade mês a mês — mesmos painéis do Report SLAs,
              só sobre incidentes abertos pelo AIOPER. */}
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">Desempenho de SLA (AIOPER)</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-4">
              Mesmos indicadores do Report SLAs (SLA1, SLA2, Prioridade), calculados só sobre os incidentes abertos
              automaticamente pelo bot.
            </p>
            {errorTrend && (
              <p className="text-rose-500 dark:text-rose-400 text-sm mb-4">
                Erro ao carregar a tendência do AIOPER.
              </p>
            )}
            <div className="grid lg:grid-cols-2 gap-6">
              <Panel title="SLA1 — Tempo Médio de Escalonamento" subtitle="Meta: < 15 min">
                {loadingTrend ? (
                  <p className="text-slate-500 text-sm">Carregando...</p>
                ) : (
                  <TrendChart
                    data={trend}
                    type="line"
                    series={[
                      { dataKey: "sla1_avg_minutes", label: "Sem Justificações", color: "#E21B23" },
                      { dataKey: "sla1_avg_minutes_justificado", label: "Com Justificações", color: "#0FA811" },
                    ]}
                    valueFormatter={minutesToHms}
                  />
                )}
              </Panel>

              <Panel title="SLA2 — Escalonamento de Incidentes" subtitle="OK vs NOK vs Justificados, meta >= 90% (linha = 10% do total)">
                {loadingTrend ? (
                  <p className="text-slate-500 text-sm">Carregando...</p>
                ) : (
                  <TrendChart
                    data={trend}
                    type="bar"
                    series={[
                      { dataKey: "sla2_ok", label: "OK", color: "#0FA811" },
                      { dataKey: "sla2_nok", label: "NOK", color: "#E21B23" },
                      { dataKey: "sla2_justificados", label: "Justificados", color: "#FAB138" },
                    ]}
                    thresholdKey="sla2_threshold_count"
                  />
                )}
              </Panel>

              <Panel title="Incidentes por Prioridade (mensal)">
                {loadingTrend ? (
                  <p className="text-slate-500 text-sm">Carregando...</p>
                ) : (
                  <TrendChart
                    data={trend}
                    type="bar"
                    series={[
                      { dataKey: "priority_critical", label: "Critical", color: "#E21B23" },
                      { dataKey: "priority_high", label: "High", color: "#FAB138" },
                      { dataKey: "priority_moderate", label: "Moderate", color: "#F9E33B" },
                      { dataKey: "priority_low", label: "Low", color: "#30ADDE" },
                    ]}
                  />
                )}
              </Panel>
            </div>
          </div>

          {/* Matriz Prioridade > Source, só AIOPER (mesma tabela de Central Operacional) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-300 dark:border-slate-800">
            <h3 className="text-slate-800 dark:text-white font-semibold mb-4">Incidentes Abertos por Prioridade (AIOPER)</h3>
            <GroupedMonthlyTable data={data?.aioper_priority_source_matrix} level1Label="Prioridade" />
          </div>
        </>
      )}
    </div>
  );
}
