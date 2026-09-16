// components/Tables/GroupedMonthlyTable.jsx
// Pivot Nível1 > Nível2 (colapsável) x mês -> contagem — "Incidentes
// Abertos por Prioridade"/"por Source" de Central Operacional (réplica
// da tabela matriz do dashboard antigo). Cada linha de nível 1 pode ser
// recolhida/expandida; começa tudo expandido.
import { Fragment, useState } from "react";

const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function monthLabel(m) {
  const mm = Number(m.split("-")[1]);
  return MONTH_NAMES[mm - 1] || m;
}

const stickyCellClass = "sticky left-0 bg-white dark:bg-slate-900";

export default function GroupedMonthlyTable({ data, level1Label }) {
  const { months = [], rows = [], month_totals = {}, grand_total = 0 } = data || {};
  // Guarda quem está EXPANDIDO (não quem está colapsado) — por omissão
  // (Set vazio) tudo começa colapsado, sem precisar de sincronizar este
  // estado sempre que os dados mudam (novo período/região = novas
  // labels, continuam simplesmente ausentes do Set = colapsadas).
  const [expanded, setExpanded] = useState(() => new Set());

  if (!months.length) {
    return <p className="text-slate-500 text-sm">Sem dados no período selecionado.</p>;
  }

  function toggle(label) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setExpanded(new Set(rows.map((r) => r.label)))}
          className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          Expandir tudo
        </button>
        <button
          type="button"
          onClick={() => setExpanded(new Set())}
          className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          Colapsar tudo
        </button>
      </div>
      <div className="overflow-x-auto">
      <table className="text-xs border-collapse w-full">
        <thead>
          <tr>
            <th className={`${stickyCellClass} z-10 text-left pr-4 pb-2 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 min-w-[170px]`}>
              {level1Label}
            </th>
            {months.map((m) => (
              <th
                key={m}
                className="px-2 pb-2 text-center font-normal border-b border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 min-w-[56px] whitespace-nowrap"
              >
                {monthLabel(m)}
              </th>
            ))}
            <th className="pl-3 pb-2 text-center border-b border-slate-200 dark:border-slate-800 font-semibold text-slate-700 dark:text-slate-200">
              Total
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
          {rows.map((row) => {
            const isCollapsed = !expanded.has(row.label);
            return (
              <Fragment key={row.label}>
                <tr className="bg-slate-50 dark:bg-slate-950/40">
                  <td className={`${stickyCellClass} z-10 pr-4 py-1.5 font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap`}>
                    <button
                      type="button"
                      onClick={() => toggle(row.label)}
                      className="mr-1.5 inline-flex items-center justify-center w-4 h-4 rounded border border-slate-300 dark:border-slate-700 text-[10px] leading-none text-slate-500 dark:text-slate-400 hover:border-emerald-400"
                      title={isCollapsed ? "Expandir" : "Colapsar"}
                    >
                      {isCollapsed ? "+" : "−"}
                    </button>
                    {row.label}
                  </td>
                  {months.map((m) => (
                    <td key={m} className="px-2 py-1.5 text-center font-semibold text-slate-700 dark:text-slate-200">
                      {row.by_month[m] || ""}
                    </td>
                  ))}
                  <td className="pl-3 py-1.5 text-center font-bold text-slate-800 dark:text-white">{row.total}</td>
                </tr>
                {!isCollapsed &&
                  row.children.map((child) => (
                    <tr key={`${row.label}-${child.label}`}>
                      <td className={`${stickyCellClass} z-10 pr-4 py-1 pl-7 text-slate-500 dark:text-slate-400 whitespace-nowrap`}>
                        {child.label}
                      </td>
                      {months.map((m) => (
                        <td key={m} className="px-2 py-1 text-center text-slate-500 dark:text-slate-400">
                          {child.by_month[m] || ""}
                        </td>
                      ))}
                      <td className="pl-3 py-1 text-center text-slate-600 dark:text-slate-300">{child.total}</td>
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-300 dark:border-slate-800 font-bold text-slate-800 dark:text-white">
            <td className={`${stickyCellClass} z-10 pr-4 py-2`}>Total</td>
            {months.map((m) => (
              <td key={m} className="px-2 py-2 text-center">{month_totals[m] || ""}</td>
            ))}
            <td className="pl-3 py-2 text-center">{grand_total}</td>
          </tr>
        </tfoot>
      </table>
      </div>
    </div>
  );
}
