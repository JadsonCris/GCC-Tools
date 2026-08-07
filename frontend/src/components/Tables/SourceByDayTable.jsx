// components/Tables/SourceByDayTable.jsx
// Pivot Source (linha) x dia de abertura (coluna) — réplica da tabela do
// dashboard antigo. Scroll horizontal com a coluna "Source" fixa
// (sticky), cabeçalho de 2 linhas (mês agrupando os dias, dia do mês).
const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function groupByMonth(days) {
  const groups = [];
  for (const day of days) {
    const [, m] = day.split("-");
    const monthKey = day.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.key === monthKey) {
      last.days.push(day);
    } else {
      groups.push({ key: monthKey, label: MONTH_NAMES[Number(m) - 1] || m, days: [day] });
    }
  }
  return groups;
}

const stickyCellClass = "sticky left-0 bg-white dark:bg-slate-900";

export default function SourceByDayTable({ data }) {
  const { days = [], rows = [], day_totals = {}, grand_total = 0 } = data || {};

  if (!days.length) {
    return <p className="text-slate-500 text-sm">Sem dados no período selecionado.</p>;
  }

  const monthGroups = groupByMonth(days);

  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className={`${stickyCellClass} z-10 text-left pr-4`}></th>
            {monthGroups.map((g) => (
              <th
                key={g.key}
                colSpan={g.days.length}
                className="text-center text-slate-500 dark:text-slate-400 font-medium pb-1 border-b border-slate-200 dark:border-slate-800"
              >
                {g.label}
              </th>
            ))}
            <th className="pb-1"></th>
          </tr>
          <tr>
            <th className={`${stickyCellClass} z-10 text-left pr-4 pb-2 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400`}>
              Source
            </th>
            {days.map((day) => (
              <th
                key={day}
                className="px-1.5 pb-2 text-center font-normal border-b border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 min-w-[26px]"
              >
                {Number(day.split("-")[2])}
              </th>
            ))}
            <th className="pl-3 pb-2 text-center border-b border-slate-200 dark:border-slate-800 font-semibold text-slate-700 dark:text-slate-200">
              Total
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
          {rows.map((row) => (
            <tr key={row.source}>
              <td className={`${stickyCellClass} z-10 pr-4 py-1 font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap`}>
                {row.source}
              </td>
              {days.map((day) => (
                <td key={day} className="px-1.5 py-1 text-center text-slate-500 dark:text-slate-400">
                  {row.values[day] || ""}
                </td>
              ))}
              <td className="pl-3 py-1 text-center font-semibold text-slate-700 dark:text-slate-200">{row.total}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-300 dark:border-slate-800 font-semibold text-slate-700 dark:text-slate-200">
            <td className={`${stickyCellClass} z-10 pr-4 py-2`}>Total</td>
            {days.map((day) => (
              <td key={day} className="px-1.5 py-2 text-center">{day_totals[day] || ""}</td>
            ))}
            <td className="pl-3 py-2 text-center">{grand_total}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
