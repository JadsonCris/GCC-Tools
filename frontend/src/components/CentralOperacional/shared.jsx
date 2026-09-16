// components/CentralOperacional/shared.jsx
// Peças reaproveitadas por vários separadores da Atividade Operacional
// (Global, Individual, Equipa) — promovidas de OperationalActivitySection.jsx
// quando a secção ganhou mais separadores (Equipa, Timeline, Equilíbrio
// de Turnos, CI's no AIOPS, Lista de Incidentes).
const TURNOS = ["Manhã", "Tarde", "Noite"];

export function Kpi({ label, value, color }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-300 dark:border-slate-800">
      <div className="text-xs text-slate-500 dark:text-slate-400 uppercase font-medium">{label}</div>
      <div className="text-2xl font-black mt-1 text-slate-800 dark:text-white" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}

export function SplitKpi({ label, abertos, resolvidos, subAbertos, subResolvidos }) {
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

export function TurnoCards({ turnos }) {
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
          <div className="flex justify-between text-sm py-1">
            <span className="text-slate-500 dark:text-slate-400">CI's/dia</span>
            <span className="font-bold" style={{ color: "#9333EA" }}>{turnos.cis?.[t]?.avg_per_day ?? 0}</span>
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

const TEAM_LABEL = { PT: "Equipa PT", BR: "Equipa BR", "-": "Sem equipa atribuída" };

export function TeamBreakdown({ equipas }) {
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
            <div className="flex justify-between text-sm py-1">
              <span className="text-slate-500 dark:text-slate-400">CI's</span>
              <span className="font-bold" style={{ color: "#9333EA" }}>{equipas.cis?.[t] ?? 0}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Checklist de operadores (mostrar/ocultar) — filtro de "controlo de
 * equipa" partilhado por Global/Individual/Equipa/CI's no AIOPS (recalculado
 * no frontend, ver utils/operationalActivityCalc.js) e passado ao backend
 * como `hidden` na Timeline/Equilíbrio de Turnos (essas precisam de
 * recalcular sessões, não dá pra fazer só somando dados já agregados).
 */
export function OperatorFilter({ operators, hidden, onToggle, onShowAll, onHideAll }) {
  if (!operators.length) return null;
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-300 dark:border-slate-800">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Filtro de Operadores{" "}
          <span className="font-normal text-slate-400 dark:text-slate-500">
            ({operators.length - hidden.size} de {operators.length} visíveis)
          </span>
        </h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onShowAll}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            Mostrar todos
          </button>
          <button
            type="button"
            onClick={onHideAll}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            Ocultar todos
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {operators.map((name) => {
          const isHidden = hidden.has(name);
          return (
            <label
              key={name}
              className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border cursor-pointer select-none transition-colors ${
                isHidden
                  ? "border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-600 bg-slate-50 dark:bg-slate-950/60"
                  : "border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900"
              }`}
            >
              <input type="checkbox" checked={!isHidden} onChange={() => onToggle(name)} className="accent-emerald-500" />
              {name}
            </label>
          );
        })}
      </div>
    </div>
  );
}
