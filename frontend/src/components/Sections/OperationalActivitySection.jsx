// components/Sections/OperationalActivitySection.jsx
// Substitui "Atividade da Equipa" em Central Operacional — visão global +
// individual de incidentes abertos (por técnico) vs resolvidos (tags
// OK_GCC) vs CI's colocados, adaptado do protótipo HTML "análise de
// incidentes" v20 fornecido pelo utilizador. Ganhou, nesta migração, os
// separadores Equipa/Timeline/Equilíbrio de Turnos/CI's no AIOPS/Lista de
// Incidentes e um filtro de operadores partilhado (ver
// ../CentralOperacional/*, utils/operationalActivityCalc.js).
//
// Segue sempre o filtro de período/geografia global (DateRangeFilter) da
// página, exceto Timeline/Equilíbrio de Turnos, que têm o seu próprio
// seletor de mês (réplica do protótipo original) — e Lista de Incidentes,
// que usa o filtro de período global mas não o filtro de operadores
// (mesmo comportamento do protótipo: essa lista é sobre incidentes, não
// sobre quem está a ser analisado).
import { useMemo, useState } from "react";
import TrendChart from "../Charts/TrendChart";
import { Kpi, SplitKpi, TurnoCards, TeamBreakdown, OperatorFilter } from "../CentralOperacional/shared";
import EquipaTab from "../CentralOperacional/EquipaTab";
import TimelineTab from "../CentralOperacional/TimelineTab";
import EquilibrioTab from "../CentralOperacional/EquilibrioTab";
import AiopsCiTab from "../CentralOperacional/AiopsCiTab";
import IncidentsListTab from "../CentralOperacional/IncidentsListTab";
import RankingTable from "../CentralOperacional/RankingTable";
import { filterOperationalActivity } from "../../utils/operationalActivityCalc";

function ActivityView({ view }) {
  if (!view) return <p className="text-slate-500 text-sm">Sem dados no período selecionado.</p>;
  const { kpis, destaques, turnos, distribuicao_horaria, distribuicao_semana, evolucao_mensal } = view;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <Kpi label="Total Abertos" value={kpis.total_abertos} color="#0FA811" />
        <Kpi label="Total Resolvidos" value={kpis.total_resolvidos} color="#2B6CB0" />
        <Kpi label="Total CI's" value={kpis.total_cis} color="#9333EA" />
        <Kpi label="Média Abertos/Dia" value={kpis.avg_abertos_dia} />
        <Kpi label="Média Resolvidos/Dia" value={kpis.avg_resolvidos_dia} />
        <Kpi label="Média CI's/Dia" value={kpis.avg_cis_dia} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <SplitKpi
          label="Dia mais movimentado"
          abertos={destaques.abertos.peak_day ?? "—"}
          resolvidos={destaques.resolvidos.peak_day ?? "—"}
          subAbertos={destaques.abertos.peak_day ? `${destaques.abertos.peak_day_val} inc.` : ""}
          subResolvidos={destaques.resolvidos.peak_day ? `${destaques.resolvidos.peak_day_val} inc.` : ""}
        />
        <SplitKpi
          label="Hora de pico"
          abertos={destaques.abertos.peak_hour != null ? `${String(destaques.abertos.peak_hour).padStart(2, "0")}h` : "—"}
          resolvidos={destaques.resolvidos.peak_hour != null ? `${String(destaques.resolvidos.peak_hour).padStart(2, "0")}h` : "—"}
        />
        <SplitKpi
          label="Dia da semana + produtivo"
          abertos={destaques.abertos.peak_weekday ?? "—"}
          resolvidos={destaques.resolvidos.peak_weekday ?? "—"}
        />
        <SplitKpi
          label="Melhor mês"
          abertos={destaques.abertos.best_month ?? "—"}
          resolvidos={destaques.resolvidos.best_month ?? "—"}
          subAbertos={destaques.abertos.best_month ? `${destaques.abertos.best_month_val} inc.` : ""}
          subResolvidos={destaques.resolvidos.best_month ? `${destaques.resolvidos.best_month_val} inc.` : ""}
        />
      </div>

      <TurnoCards turnos={turnos} />

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-300 dark:border-slate-800">
          <h3 className="text-slate-800 dark:text-white font-semibold mb-4">Distribuição Horária</h3>
          <TrendChart
            data={distribuicao_horaria}
            type="bar"
            xKey="hour"
            series={[
              { dataKey: "abertos", label: "Abertos", color: "#0FA811" },
              { dataKey: "resolvidos", label: "Resolvidos", color: "#2B6CB0" },
              { dataKey: "cis", label: "CI's", color: "#9333EA" },
            ]}
          />
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-300 dark:border-slate-800">
          <h3 className="text-slate-800 dark:text-white font-semibold mb-4">Distribuição por Dia da Semana</h3>
          <TrendChart
            data={distribuicao_semana}
            type="bar"
            xKey="weekday"
            series={[
              { dataKey: "abertos", label: "Abertos", color: "#0FA811" },
              { dataKey: "resolvidos", label: "Resolvidos", color: "#2B6CB0" },
              { dataKey: "cis", label: "CI's", color: "#9333EA" },
            ]}
          />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-300 dark:border-slate-800">
        <h3 className="text-slate-800 dark:text-white font-semibold mb-4">Evolução Mensal</h3>
        <TrendChart
          data={evolucao_mensal}
          type="line"
          series={[
            { dataKey: "abertos", label: "Abertos", color: "#0FA811" },
            { dataKey: "resolvidos", label: "Resolvidos", color: "#2B6CB0" },
            { dataKey: "cis", label: "CI's", color: "#9333EA" },
          ]}
        />
      </div>
    </div>
  );
}

const TABS = [
  { id: "global", label: "Visão Global" },
  { id: "individual", label: "Visão Individual" },
  { id: "equipa", label: "Equipa" },
  { id: "timeline", label: "Timeline" },
  { id: "equilibrio", label: "Equilíbrio de Turnos" },
  { id: "aiops", label: "CI's no AIOPS" },
  { id: "lista", label: "Lista de Incidentes" },
];

export default function OperationalActivitySection({ data, ciAioperSummary, range, region }) {
  const [tab, setTab] = useState("global");
  const [operador, setOperador] = useState(null);
  const [hidden, setHidden] = useState(() => new Set());

  const allOperators = useMemo(
    () => (data?.individual ?? []).map((o) => o.tecnico).sort((a, b) => a.localeCompare(b, "pt")),
    [data]
  );
  const filteredData = useMemo(() => filterOperationalActivity(data, hidden), [data, hidden]);
  const filteredCiAioper = useMemo(() => {
    if (!ciAioperSummary || !hidden.size) return ciAioperSummary;
    const removed = ciAioperSummary.ranking.filter((r) => hidden.has(r.tecnico));
    const ranking = ciAioperSummary.ranking.filter((r) => !hidden.has(r.tecnico));
    const removedCis = removed.reduce((n, r) => n + r.cis, 0);
    return { ...ciAioperSummary, ranking, total_cis: ciAioperSummary.total_cis - removedCis };
  }, [ciAioperSummary, hidden]);

  function toggleHidden(name) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  if (!data) {
    return <p className="text-slate-500 text-sm">Sem dados no período selecionado.</p>;
  }

  const individualList = filteredData.individual ?? [];
  const selected = individualList.find((o) => o.tecnico === operador) ?? individualList[0] ?? null;

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === t.id
                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab !== "lista" && (
        <OperatorFilter
          operators={allOperators}
          hidden={hidden}
          onToggle={toggleHidden}
          onShowAll={() => setHidden(new Set())}
          onHideAll={() => setHidden(new Set(allOperators))}
        />
      )}

      {tab === "global" && (
        <>
          <TeamBreakdown equipas={filteredData.global?.equipas} />
          <ActivityView view={filteredData.global} />

          <div className="space-y-6">
            <RankingTable
              title="Ranking - Abertos"
              individual={individualList}
              metricKey="total_abertos"
              diasKey="dias_ativos_abertos"
              avgKey="avg_abertos_dia"
              metricLabel="Abertos"
              color="#0FA811"
            />
            <RankingTable
              title="Ranking - Resolvidos"
              individual={individualList}
              metricKey="total_resolvidos"
              diasKey="dias_ativos_resolvidos"
              avgKey="avg_resolvidos_dia"
              metricLabel="Resolvidos"
              color="#2B6CB0"
            />
            <RankingTable
              title="Ranking - CI's Inseridos"
              individual={individualList}
              metricKey="total_cis"
              diasKey="dias_ativos_cis"
              avgKey="avg_cis_dia"
              metricLabel="CI's"
              color="#9333EA"
            />
          </div>
        </>
      )}

      {tab === "individual" && (
        <>
          <div className="flex items-center gap-3">
            <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">Operador:</label>
            {individualList.length > 0 ? (
              <select
                value={selected?.tecnico ?? ""}
                onChange={(e) => setOperador(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200"
              >
                {individualList.map((o) => (
                  <option key={o.tecnico} value={o.tecnico}>
                    {o.tecnico}{o.team !== "-" ? ` (${o.team})` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm text-slate-500 dark:text-slate-400">Sem operadores no período selecionado.</span>
            )}
          </div>
          <ActivityView view={selected} />
        </>
      )}

      {tab === "equipa" && <EquipaTab individual={individualList} />}
      {tab === "timeline" && <TimelineTab region={region} hidden={hidden} />}
      {tab === "equilibrio" && <EquilibrioTab region={region} hidden={hidden} />}
      {tab === "aiops" && <AiopsCiTab data={filteredCiAioper} />}
      {tab === "lista" && <IncidentsListTab range={range} region={region} />}
    </div>
  );
}
