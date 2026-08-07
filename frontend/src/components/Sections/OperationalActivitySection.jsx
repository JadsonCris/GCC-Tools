// components/Sections/OperationalActivitySection.jsx
// Substitui "Atividade da Equipa" em Central Operacional — visão global +
// individual de incidentes abertos (por técnico, coluna "Opened by") vs
// resolvidos (tags "OK_GCC" — ver backend/services/operational_activity_
// service.py), adaptado do protótipo HTML fornecido pelo utilizador pra
// consumir os dados reais da BD em vez de ficheiros carregados à mão.
// Sem seletor de mês próprio — segue sempre o filtro de período global
// (DateRangeFilter) da página, como o resto de Central Operacional.
import { useState } from "react";
import TrendChart from "../Charts/TrendChart";

const TURNOS = ["Manhã", "Tarde", "Noite"];
const TEAM_LABEL = { PT: "Equipa PT", BR: "Equipa BR", "-": "Sem equipa atribuída" };

function Kpi({ label, value, color }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-300 dark:border-slate-800">
      <div className="text-xs text-slate-500 dark:text-slate-400 uppercase font-medium">{label}</div>
      <div className="text-2xl font-black mt-1 text-slate-800 dark:text-white" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}

function SplitKpi({ label, abertos, resolvidos, subAbertos, subResolvidos }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-300 dark:border-slate-800">
      <div className="text-xs text-slate-500 dark:text-slate-400 uppercase font-medium mb-2">{label}</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[11px] font-bold" style={{ color: "#0FA811" }}>ABERTOS</div>
          <div className="text-base font-bold text-slate-700 dark:text-slate-200">{abertos ?? "—"}</div>
          {subAbertos && <div className="text-xs text-slate-400 dark:text-slate-500">{subAbertos}</div>}
        </div>
        <div>
          <div className="text-[11px] font-bold" style={{ color: "#2B6CB0" }}>RESOLVIDOS</div>
          <div className="text-base font-bold text-slate-700 dark:text-slate-200">{resolvidos ?? "—"}</div>
          {subResolvidos && <div className="text-xs text-slate-400 dark:text-slate-500">{subResolvidos}</div>}
        </div>
      </div>
    </div>
  );
}

function TurnoCards({ turnos }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {TURNOS.map((t) => (
        <div key={t} className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-300 dark:border-slate-800">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">{t}</div>
          <div className="flex justify-between text-sm py-1">
            <span className="text-slate-500 dark:text-slate-400">Abertos/dia</span>
            <span className="font-bold" style={{ color: "#0FA811" }}>{turnos.abertos[t]?.avg_per_day ?? 0}</span>
          </div>
          <div className="flex justify-between text-sm py-1">
            <span className="text-slate-500 dark:text-slate-400">Resolvidos/dia</span>
            <span className="font-bold" style={{ color: "#2B6CB0" }}>{turnos.resolvidos[t]?.avg_per_day ?? 0}</span>
          </div>
          <div className="flex justify-between text-xs pt-2 mt-2 border-t border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500">
            <span>Total abertos</span><span>{turnos.abertos[t]?.count ?? 0}</span>
          </div>
          <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500">
            <span>Total resolvidos</span><span>{turnos.resolvidos[t]?.count ?? 0}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamBreakdown({ equipas }) {
  if (!equipas) return null;
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-300 dark:border-slate-800">
      <h3 className="text-slate-800 dark:text-white font-semibold mb-1">Trabalho por Geografia da Equipa</h3>
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
        Agrupamento por onde a pessoa está sediada (PT/BR) — não tem relação com a geografia do incidente (Ibéria/Brasil).
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {["PT", "BR", "-"].map((t) => (
          <div key={t} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">{TEAM_LABEL[t]}</div>
            <div className="flex justify-between text-sm py-1">
              <span className="text-slate-500 dark:text-slate-400">Abertos</span>
              <span className="font-bold" style={{ color: "#0FA811" }}>{equipas.abertos?.[t] ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm py-1">
              <span className="text-slate-500 dark:text-slate-400">Resolvidos</span>
              <span className="font-bold" style={{ color: "#2B6CB0" }}>{equipas.resolvidos?.[t] ?? 0}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityView({ view }) {
  if (!view) return <p className="text-slate-500 text-sm">Sem dados no período selecionado.</p>;
  const { kpis, destaques, turnos, distribuicao_horaria, distribuicao_semana, evolucao_mensal } = view;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Total Abertos" value={kpis.total_abertos} color="#0FA811" />
        <Kpi label="Total Resolvidos" value={kpis.total_resolvidos} color="#2B6CB0" />
        <Kpi label="Média Abertos/Dia" value={kpis.avg_abertos_dia} />
        <Kpi label="Média Resolvidos/Dia" value={kpis.avg_resolvidos_dia} />
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
          abertos={`${String(destaques.abertos.peak_hour).padStart(2, "0")}h`}
          resolvidos={`${String(destaques.resolvidos.peak_hour).padStart(2, "0")}h`}
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
          ]}
        />
      </div>
    </div>
  );
}

const TABS = [
  { id: "global", label: "Visão Global" },
  { id: "individual", label: "Visão Individual" },
];

export default function OperationalActivitySection({ data }) {
  const [tab, setTab] = useState("global");
  const [operador, setOperador] = useState(null);

  if (!data) {
    return <p className="text-slate-500 text-sm">Sem dados no período selecionado.</p>;
  }

  const individualList = data.individual ?? [];
  const selected = individualList.find((o) => o.tecnico === operador) ?? individualList[0] ?? null;

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "global" && (
        <>
          <TeamBreakdown equipas={data.global?.equipas} />
          <ActivityView view={data.global} />
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
    </div>
  );
}
