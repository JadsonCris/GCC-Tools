// components/Sections/SlaOverviewSection.jsx
import { useQuery } from "@tanstack/react-query";
import { getRangeSummary } from "../../service/dashboardApi";
import SlaCard from "../Cards/SlaCard";
import OperatorsTable from "../Tables/OperatorsTable";
import SemEventoTable from "../Tables/SemEventoTable";
import PriorityBarChartMui from "../Charts/PriorityBarChartMui";
import ToolsPieChartMui from "../Charts/ToolsPieChartMui";
import DateRangeFilter from "../Filters/DateRangeFilter";
import { useDateRange } from "../../context/DateRangeContext.jsx";

export default function SlaOverviewSection() {
  const { range, region } = useDateRange();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["range-summary", range?.start, range?.end, region],
    queryFn: () => getRangeSummary(range.start, range.end, region),
    enabled: !!range,
  });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">Acordos de Nível de Serviço (SLA)</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Histórico acumulado (inclui incidentes já fora do relatório ao vivo do ServiceNow) — escolhe o período.
        </p>
      </div>

      <DateRangeFilter />

      {isLoading && (
        <div className="space-y-6 animate-pulse">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-40 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
            ))}
          </div>
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center justify-center h-96 border border-red-500/20 bg-red-500/5 rounded-xl p-8 text-center">
          <div className="text-red-500 dark:text-red-400 text-xl font-semibold mb-2">Falha ao carregar dados de SLA</div>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md mb-6">
            {error?.message || "Não foi possível conectar ao servidor para buscar as métricas do ServiceNow."}
          </p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-white rounded-lg text-sm font-medium transition-colors border border-slate-300 dark:border-slate-700"
          >
            Tentar Novamente
          </button>
        </div>
      )}

      {data && <SlaOverviewContent data={data} />}
    </div>
  );
}

function SlaOverviewContent({ data }) {
  const sla1 = data?.sla_overview?.sla1 ?? { avg_time: "00:00:00", target_minutes: 15, avg_seconds: 0, available: false };
  const sla2 = data?.sla_overview?.sla2 ?? { pct: 0, target: 90, available: false };
  const sla3 = data?.sla_overview?.sla3 ?? {
    achieved: 0, not_achieved: 0, justificados: 0, sla3_pct: 0, target: 70, available: false,
  };
  const sla4 = data?.sla_overview?.sla4 ?? { sla4_not_achieved: 0, sla4_justificados: 0, threshold_minutes: 3, available: false };

  const semEvento = data?.sem_evento_summary;
  const comEvento = semEvento?.com_evento_count ?? 0;
  const semEventoCount = semEvento?.sem_evento_count ?? 0;
  const totalEventos = comEvento + semEventoCount;

  return (
    <div className="space-y-8">
      {/* Os 4 SLAs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SlaCard
          title="SLA1 - Tempo Médio de Escalonamento"
          targetLabel={`Target < ${sla1.target_minutes} min.`}
          value={sla1.available ? sla1.avg_time : "—"}
          isMet={sla1.avg_seconds < sla1.target_minutes * 60}
          pending={!sla1.available}
          note="(sem dados de evento no período)"
        />
        <SlaCard
          title="SLA2 - Escalonamento de Incidentes"
          targetLabel={`Target >= ${sla2.target}%`}
          value={sla2.available ? sla2.pct : "—"}
          valueSuffix={sla2.available ? "%" : ""}
          isMet={sla2.pct >= sla2.target}
          pending={!sla2.available}
          note="(sem dados de evento no período)"
        />
        <SlaCard
          title="SLA3 - Índice de Proatividade"
          targetLabel={`Target >= ${sla3.target}%`}
          value={sla3.available ? sla3.sla3_pct : "—"}
          valueSuffix={sla3.available ? "%" : ""}
          isMet={sla3.sla3_pct >= sla3.target}
          pending={!sla3.available}
          note="(sem P1 no período)"
          subMetrics={[
            { label: "Cumpridos", value: sla3.achieved, color: "#0FA811" },
            { label: "Violados", value: sla3.not_achieved, color: "#E21B23" },
            { label: "Justificados", value: sla3.justificados, color: "#FAB138" },
          ]}
        />
        <SlaCard
          title="SLA4 - Incidentes P1's Despromovidos"
          targetLabel={`Target <= ${sla4.threshold_minutes ?? 3}`}
          value={sla4.available ? sla4.sla4_not_achieved : "—"}
          isMet={sla4.available && sla4.sla4_not_achieved <= (sla4.threshold_minutes ?? 3)}
          pending={!sla4.available}
          note="(sem task P1 no período)"
          subMetrics={[
            { label: "Não Cumpridos", value: sla4.sla4_not_achieved, color: "#E21B23" },
            { label: "Justificados", value: sla4.sla4_justificados, color: "#FAB138" },
          ]}
        />
      </div>

      {/* Tabela de Operadores (Incidentes / NOK / %NOK / Tempo Médio) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-6">
        <h3 className="text-slate-800 dark:text-white font-semibold mb-4">Técnicos — Incidentes e Não Conformidades</h3>
        <OperatorsTable data={data?.operators_summary ?? []} variant="nok" />
      </div>

      {/* Prioridade + Ferramentas (MUI X Charts) */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-300 dark:border-slate-800">
          <h3 className="text-slate-800 dark:text-white font-semibold mb-6">Quant. de Incidentes por Prioridade</h3>
          <PriorityBarChartMui data={data?.priority_breakdown ?? []} />
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-300 dark:border-slate-800">
          <h3 className="text-slate-800 dark:text-white font-semibold mb-6">Falha de SLA por Ferramenta</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 -mt-4 mb-4">Só incidentes onde o SLA1 falhou (&gt;=15 min até a abertura).</p>
          <ToolsPieChartMui data={data?.tools_sla1_failures ?? []} />
        </div>
      </div>

      {/* Com Evento vs Sem Evento */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-300 dark:border-slate-800">
        <h3 className="text-slate-800 dark:text-white font-semibold mb-6">Quant. de Incidentes por Evento</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-100 dark:bg-slate-950 rounded-xl p-5 border border-slate-300 dark:border-slate-800 text-center">
            <div className="text-3xl font-black text-emerald-500 dark:text-emerald-400">{comEvento}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 uppercase font-medium mt-2">Com Evento</div>
            <div className="text-[11px] text-slate-400 dark:text-slate-600 mt-1">
              {totalEventos > 0 ? Math.round((comEvento / totalEventos) * 100) : 0}% do total
            </div>
          </div>
          <div className="bg-slate-100 dark:bg-slate-950 rounded-xl p-5 border border-slate-300 dark:border-slate-800 text-center">
            <div className="text-3xl font-black text-amber-600 dark:text-amber-500">{semEventoCount}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 uppercase font-medium mt-2">Sem Evento</div>
            <div className="text-[11px] text-slate-400 dark:text-slate-600 mt-1">
              {totalEventos > 0 ? Math.round((semEventoCount / totalEventos) * 100) : 0}% do total
            </div>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-slate-300 dark:border-slate-800">
          <h4 className="text-slate-800 dark:text-white font-semibold mb-4 text-sm">Sem Evento — por Grupo e Descrição</h4>
          <SemEventoTable breakdown={semEvento?.breakdown ?? []} />
        </div>
      </div>
    </div>
  );
}
