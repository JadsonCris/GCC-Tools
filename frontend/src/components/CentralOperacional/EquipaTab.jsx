// components/CentralOperacional/EquipaTab.jsx
// Cards por equipa (PT/BR/Neutra/AIOPS) — réplica de renderEquipa() do
// protótipo v20, usando a mesma agregação do filtro de operadores
// (ver utils/operationalActivityCalc.js) aplicada a cada grupo em vez de
// ao conjunto todo.
import { Kpi, TurnoCards } from "./shared";
import { aggregateIndividuals } from "../../utils/operationalActivityCalc";

const GROUPS = [
  { key: "PT", label: "Equipa PT", noResolved: false, match: (o) => o.team === "PT" },
  { key: "BR", label: "Equipa BR", noResolved: false, match: (o) => o.team === "BR" },
  { key: "Neutra", label: "Equipa Neutra", noResolved: false, match: (o) => o.team === "-" && !o.tecnico.startsWith("AIOPS") },
  { key: "AIOPS", label: "AIOPS", noResolved: true, match: (o) => o.tecnico.startsWith("AIOPS") },
];

export default function EquipaTab({ individual }) {
  const list = individual ?? [];

  return (
    <div className="space-y-8">
      {GROUPS.map((g) => {
        const members = list.filter(g.match);
        const view = aggregateIndividuals(members);
        return (
          <div key={g.key}>
            <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-3">
              {g.label}{" "}
              <span className="text-sm font-normal text-slate-400 dark:text-slate-500">
                ({members.length} membro{members.length === 1 ? "" : "s"})
              </span>
            </h3>
            {!view ? (
              <p className="text-slate-500 text-sm">Sem atividade no período selecionado.</p>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <Kpi label="Total Abertos" value={view.kpis.total_abertos} color="#0FA811" />
                  <Kpi label="Total Resolvidos" value={g.noResolved ? "N/A" : view.kpis.total_resolvidos} color="#2B6CB0" />
                  <Kpi label="Total CI's" value={view.kpis.total_cis} color="#9333EA" />
                  <Kpi label="Operadores" value={members.length} />
                </div>
                <TurnoCards turnos={view.turnos} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
