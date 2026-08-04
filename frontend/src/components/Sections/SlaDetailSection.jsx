// components/Sections/SlaDetailSection.jsx
// Detalhe extra do Report SLAs, além do que já está na Visão Geral
// (SlaOverviewSection): números agregados (clicáveis, abrem a lista de
// incidentes por trás do número) + tendência mensal de cada SLA —
// réplica do dashboard "Service Level Management" original (painel a
// painel), com o nosso design (tema escuro, MUI X Charts).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRangeSummary, getSlaTrend } from "../../service/dashboardApi";
import { useDateRange } from "../../context/DateRangeContext.jsx";
import TrendChart from "../Charts/TrendChart";
import IncidentsStatusModal from "../Tables/IncidentsStatusModal";

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

const STATUS_CARDS = [
  { status: "ok", label: "SLA Cumprido", color: "#0FA811", key: "ok_count" },
  { status: "nok", label: "SLA Falhado", color: "#E21B23", key: "nok_count" },
  { status: "justificados", label: "Justificado", color: "#FAB138", key: "justificados" },
];

export default function SlaDetailSection() {
  const { range, region } = useDateRange();
  const [openStatus, setOpenStatus] = useState(null); // "ok" | "nok" | "justificados" | null

  // Mesma queryKey que o SlaOverviewSection usa — o react-query partilha
  // o cache, não duplica o pedido ao backend.
  const { data } = useQuery({
    queryKey: ["range-summary", range?.start, range?.end, region],
    queryFn: () => getRangeSummary(range.start, range.end, region),
    enabled: !!range,
  });

  const { data: trend = [], isLoading: loadingTrend } = useQuery({
    queryKey: ["sla-trend", region],
    queryFn: () => getSlaTrend(region),
  });

  const quality = data?.quality_metrics;

  return (
    <div className="space-y-8">
      {/* Números agregados (do período selecionado no filtro de datas) —
          clicáveis: abrem a tabela de incidentes por trás do número. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {STATUS_CARDS.map((card) => (
          <button
            key={card.status}
            type="button"
            onClick={() => setOpenStatus(card.status)}
            className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-300 dark:border-slate-800 text-center hover:border-slate-400 dark:hover:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
            title="Clica para ver os incidentes"
          >
            <div className="text-4xl font-black" style={{ color: card.color }}>
              {quality?.[card.key] ?? "—"}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 uppercase font-medium mt-2">{card.label}</div>
          </button>
        ))}
      </div>

      {/* Tendência mensal, um painel por SLA — igual ao dashboard original */}
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

        <Panel title="SLA3 — Índice de Proatividade" subtitle="Cumpridos vs Violados vs Justificados, meta >= 70% (linha = 30% do total)">
          {loadingTrend ? (
            <p className="text-slate-500 text-sm">Carregando...</p>
          ) : (
            <TrendChart
              data={trend}
              type="bar"
              series={[
                { dataKey: "sla3_achieved", label: "Cumpridos", color: "#0FA811" },
                { dataKey: "sla3_not_achieved", label: "Violados", color: "#E21B23" },
                { dataKey: "sla3_justificados", label: "Justificados", color: "#FAB138" },
              ]}
              thresholdKey="sla3_threshold_count"
            />
          )}
        </Panel>

        <Panel title="SLA4 — P1's Despromovidos" subtitle="1ª task era P1 e foi despromovida depois, meta ≤ 3">
          {loadingTrend ? (
            <p className="text-slate-500 text-sm">Carregando...</p>
          ) : (
            <TrendChart
              data={trend}
              type="bar"
              series={[{ dataKey: "sla4_count", label: "Não Cumpridos", color: "#E21B23" }]}
            />
          )}
        </Panel>

        <Panel title="Incidentes por Prioridade">
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

        <Panel title="Com Evento vs Sem Evento">
          {loadingTrend ? (
            <p className="text-slate-500 text-sm">Carregando...</p>
          ) : (
            <TrendChart
              data={trend}
              type="line"
              series={[
                { dataKey: "com_evento", label: "Com Evento", color: "#00e5a0" },
                { dataKey: "sem_evento", label: "Sem Evento", color: "#ff4f6b" },
              ]}
            />
          )}
        </Panel>
      </div>

      {openStatus && (
        <IncidentsStatusModal status={openStatus} range={range} region={region} onClose={() => setOpenStatus(null)} />
      )}
    </div>
  );
}
