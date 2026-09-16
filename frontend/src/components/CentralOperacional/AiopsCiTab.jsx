// components/CentralOperacional/AiopsCiTab.jsx
// "CI's em INCs do AIOPS" — cruza os incidentes abertos automaticamente
// pelo bot AIOPS com a tabela de CI's, pra medir quem "limpa atrás" dele
// em vez de ser o próprio bot a documentar. Réplica de renderAiOps() do
// protótipo v20; dados já vêm no payload de getRangeSummary/getMonthlySummary
// (campo `ci_aioper_summary`), sem pedido novo ao backend.
import { useState } from "react";
import { Kpi } from "./shared";
import TrendChart from "../Charts/TrendChart";

export default function AiopsCiTab({ data }) {
  const [excludeSelf, setExcludeSelf] = useState(false);

  if (!data) return <p className="text-slate-500 text-sm">Sem dados no período selecionado.</p>;

  const selfEntry = data.ranking.find((r) => r.tecnico === "AIOPS");
  const ranking = excludeSelf ? data.ranking.filter((r) => r.tecnico !== "AIOPS") : data.ranking;
  const totalCis = excludeSelf ? data.total_cis - (selfEntry?.cis ?? 0) : data.total_cis;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
          Cruza os incidentes abertos automaticamente pelo AIOPS com a tabela de CI's —
          ranking de quem coloca CI's nesses incidentes.
        </p>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
          <input
            type="checkbox"
            checked={excludeSelf}
            onChange={(e) => setExcludeSelf(e.target.checked)}
            className="accent-emerald-500"
          />
          Excluir CI's do próprio AIOPS
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Kpi label="Incidentes abertos pelo AIOPS" value={data.total_incidentes_aiops} />
        <Kpi label="CI's nesses incidentes" value={totalCis} color="#9333EA" />
        <Kpi label="Operadores envolvidos" value={ranking.length} />
      </div>

      {ranking.length === 0 ? (
        <p className="text-slate-500 text-sm">
          {data.total_incidentes_aiops === 0
            ? "Nenhum incidente aberto pelo AIOPS no período selecionado."
            : "Nenhum CI encontrado em incidentes abertos pelo AIOPS neste período."}
        </p>
      ) : (
        <>
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-300 dark:border-slate-800">
              <h3 className="text-slate-800 dark:text-white font-semibold mb-4">CI's por Operador</h3>
              <TrendChart
                data={ranking}
                type="bar"
                xKey="tecnico"
                series={[{ dataKey: "cis", label: "CI's colocados", color: "#9333EA" }]}
              />
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-300 dark:border-slate-800">
              <h3 className="text-slate-800 dark:text-white font-semibold mb-4">CI's por Mês</h3>
              <TrendChart
                data={data.por_mes}
                type="bar"
                xKey="mes"
                series={[{ dataKey: "cis", label: "CI's em INCs do AIOPS", color: "#9333EA" }]}
              />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-300 dark:border-slate-800 overflow-x-auto">
            <h3 className="text-slate-800 dark:text-white font-semibold mb-4">Contabilização por Operador</h3>
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-300 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs uppercase font-semibold">
                  <th className="pb-3 pr-4">#</th>
                  <th className="pb-3 pr-4">Operador</th>
                  <th className="pb-3 pr-4 text-right">CI's colocados</th>
                  <th className="pb-3 text-right">Incidentes distintos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {ranking.map((r, i) => (
                  <tr key={r.tecnico}>
                    <td className="py-2 pr-4 text-slate-400">{i + 1}</td>
                    <td className="py-2 pr-4 font-medium text-slate-700 dark:text-slate-200">{r.tecnico}</td>
                    <td className="py-2 pr-4 text-right font-mono text-slate-600 dark:text-slate-300">{r.cis}</td>
                    <td className="py-2 text-right font-mono text-slate-600 dark:text-slate-300">{r.incidentes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
