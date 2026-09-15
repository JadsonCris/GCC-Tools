// components/Reports/ImportedDataTable.jsx
// Tabela genérica pras linhas importadas (colunas derivadas do próprio
// dado) — mesmo padrão visual do components/Tables/SourceByDayTable.jsx
// (cabeçalho sticky, dark:/light em todo lado). `selectable`: liga uma
// coluna de checkbox (+ "selecionar todos" no cabeçalho) — usado pelo
// CAB pra marcar changes da tabela bruta e incluí-los no relatório sem
// terem caído no cruzamento automático. `disabledIndices`: linhas já
// adicionadas noutro sítio, mostradas marcadas e bloqueadas.
export default function ImportedDataTable({
  rows,
  rowClassName,
  onRemoveRow,
  emptyLabel = "Sem dados.",
  selectable = false,
  selectedIndices,
  onToggleRow,
  onToggleAll,
  disabledIndices,
}) {
  if (!rows || rows.length === 0) {
    return <p className="text-xs text-slate-400 dark:text-slate-500 p-3">{emptyLabel}</p>;
  }

  const cols = Object.keys(rows[0]);
  const selectableIndices = rows.map((_, i) => i).filter((i) => !disabledIndices?.has(i));
  const allSelected = selectableIndices.length > 0 && selectableIndices.every((i) => selectedIndices?.has(i));

  return (
    <div className="overflow-auto max-h-[300px] rounded-lg">
      <table className="text-xs border-collapse w-full">
        <thead>
          <tr>
            {selectable && (
              <th className="sticky top-0 z-10 bg-blue-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-2 w-6">
                <input type="checkbox" checked={allSelected} onChange={(e) => onToggleAll?.(e.target.checked)} />
              </th>
            )}
            {cols.map((c) => (
              <th
                key={c}
                className="sticky top-0 z-10 bg-blue-50 dark:bg-slate-800 text-blue-700 dark:text-blue-300 px-2.5 py-1.5 text-left font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap"
              >
                {c}
              </th>
            ))}
            {onRemoveRow && (
              <th className="sticky top-0 z-10 bg-blue-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700" />
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
          {rows.map((row, i) => {
            const disabled = disabledIndices?.has(i);
            return (
              <tr
                key={i}
                className={
                  disabled
                    ? "bg-emerald-50 dark:bg-emerald-900/20"
                    : rowClassName
                    ? rowClassName(row)
                    : i % 2 === 0
                    ? "bg-white dark:bg-slate-900"
                    : "bg-slate-50 dark:bg-slate-900/60"
                }
              >
                {selectable && (
                  <td className="px-2 py-1">
                    <input
                      type="checkbox"
                      checked={disabled || Boolean(selectedIndices?.has(i))}
                      disabled={disabled}
                      onChange={() => onToggleRow?.(i)}
                    />
                  </td>
                )}
                {cols.map((c) => (
                  <td key={c} className="px-2.5 py-1 text-slate-600 dark:text-slate-300 align-top">
                    {row[c] ?? ""}
                  </td>
                ))}
                {onRemoveRow && (
                  <td className="px-2.5 py-1 text-right">
                    <button
                      type="button"
                      onClick={() => onRemoveRow(i)}
                      className="text-red-500 hover:text-red-400 text-[11px] font-bold px-2 py-0.5 rounded border border-red-500/30 hover:border-red-400 transition-colors"
                    >
                      ✕
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
