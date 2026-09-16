// components/Tables/GroupedMonthlyTable.jsx
// Pivot Nível1 > Nível2 > ... (colapsável, profundidade arbitrária) x mês
// -> contagem — "Incidentes Abertos por Prioridade"/"por Source"/"por
// Tipo de Alerta" de Central Operacional (réplica da tabela matriz do
// dashboard antigo). Cada linha com filhos pode ser recolhida/expandida;
// começa tudo colapsado.
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

// Peso visual por profundidade — nível 0 (linha-mãe) fica sempre em
// destaque; níveis mais fundos vão ficando mais "leves", com mais
// indentação. Índices além do array reutilizam o último estilo.
const ROW_STYLES = [
  { bg: "bg-slate-50 dark:bg-slate-950/40", pad: "pr-4", text: "font-semibold text-slate-700 dark:text-slate-200", total: "font-bold text-slate-800 dark:text-white" },
  { bg: "", pad: "pr-4 pl-7", text: "text-slate-500 dark:text-slate-400", total: "text-slate-600 dark:text-slate-300" },
  { bg: "", pad: "pr-4 pl-12", text: "text-slate-400 dark:text-slate-500", total: "text-slate-500 dark:text-slate-400" },
];

function rowStyle(depth) {
  return ROW_STYLES[Math.min(depth, ROW_STYLES.length - 1)];
}

// Caminho estável (não só a label) pra controlar expandido/colapsado —
// duas linhas em ramos diferentes podem ter a mesma label (ex: "Status"
// como categoria de várias ferramentas), sem isto colidiriam no mesmo
// estado.
function collectPaths(rows, parentPath = "") {
  let paths = [];
  for (const row of rows) {
    const path = parentPath ? `${parentPath}>${row.label}` : row.label;
    paths.push(path);
    if (row.children?.length) paths = paths.concat(collectPaths(row.children, path));
  }
  return paths;
}

function Row({ row, depth, parentPath, months, expanded, toggle }) {
  const path = parentPath ? `${parentPath}>${row.label}` : row.label;
  const hasChildren = !!row.children?.length;
  const isCollapsed = hasChildren && !expanded.has(path);
  const style = rowStyle(depth);

  return (
    <Fragment>
      <tr className={style.bg}>
        <td className={`${stickyCellClass} z-10 ${style.pad} py-1.5 ${style.text} whitespace-nowrap`}>
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggle(path)}
              className="mr-1.5 inline-flex items-center justify-center w-4 h-4 rounded border border-slate-300 dark:border-slate-700 text-[10px] leading-none text-slate-500 dark:text-slate-400 hover:border-emerald-400"
              title={isCollapsed ? "Expandir" : "Colapsar"}
            >
              {isCollapsed ? "+" : "−"}
            </button>
          ) : (
            <span className="inline-block w-4 mr-1.5" />
          )}
          {row.label}
        </td>
        {months.map((m) => (
          <td key={m} className={`px-2 py-1.5 text-center ${style.text}`}>
            {row.by_month[m] || ""}
          </td>
        ))}
        <td className={`pl-3 py-1.5 text-center ${style.total}`}>{row.total}</td>
      </tr>
      {hasChildren &&
        !isCollapsed &&
        row.children.map((child) => (
          <Row
            key={`${path}>${child.label}`}
            row={child}
            depth={depth + 1}
            parentPath={path}
            months={months}
            expanded={expanded}
            toggle={toggle}
          />
        ))}
    </Fragment>
  );
}

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

  function toggle(path) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setExpanded(new Set(collectPaths(rows)))}
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
          {rows.map((row) => (
            <Row key={row.label} row={row} depth={0} parentPath="" months={months} expanded={expanded} toggle={toggle} />
          ))}
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
