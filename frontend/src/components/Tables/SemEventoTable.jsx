// components/Tables/SemEventoTable.jsx
import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export default function SemEventoTable({ breakdown = [] }) {
  const grupos = useMemo(() => {
    const byGrupo = new Map();
    for (const row of breakdown) {
      const grupo = row.grupo || "Sem Grupo";
      if (!byGrupo.has(grupo)) byGrupo.set(grupo, { grupo, total: 0, items: [] });
      const entry = byGrupo.get(grupo);
      entry.total += row.count;
      entry.items.push(row);
    }
    return Array.from(byGrupo.values()).sort((a, b) => b.total - a.total);
  }, [breakdown]);

  const [expanded, setExpanded] = useState(() => new Set(grupos.map((g) => g.grupo)));

  const toggle = (grupo) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(grupo)) next.delete(grupo);
      else next.add(grupo);
      return next;
    });
  };

  if (!breakdown.length) {
    return <p className="text-slate-500 dark:text-slate-500 text-sm">Sem incidentes "Sem Evento" neste período.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-300 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">
            <th className="pb-3 pr-4">Grupo / Descrição</th>
            <th className="pb-3 pl-4 text-right">Nº Incidentes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
          {grupos.map((g) => {
            const isOpen = expanded.has(g.grupo);
            return (
              <Fragment key={g.grupo}>
                <tr
                  onClick={() => toggle(g.grupo)}
                  className="cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/20 transition-colors"
                >
                  <td className="py-2 pr-4 font-semibold text-slate-800 dark:text-white flex items-center gap-2">
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {g.grupo}
                  </td>
                  <td className="py-2 pl-4 text-right font-bold text-slate-700 dark:text-slate-200">{g.total}</td>
                </tr>
                {isOpen &&
                  g.items.map((row, i) => (
                    <tr key={`${g.grupo}-${i}`} className="text-slate-500 dark:text-slate-400">
                      <td className="py-1.5 pr-4 pl-6 truncate max-w-md">{row.short_description || "(sem descrição)"}</td>
                      <td className="py-1.5 pl-4 text-right">{row.count}</td>
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
