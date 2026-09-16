// components/CentralOperacional/RankingTable.jsx
// Ranking por operador (Abertos/Resolvidos/CI's Inseridos) — réplica das
// tabelas "Ranking" do protótipo v20, que a migração pra Atividade
// Operacional v2 tinha deixado de fora. Usa os mesmos dados já
// calculados por operador (ver operational_activity_service.
// get_operational_activity — kpis.total_X/dias_ativos_X/avg_X_dia),
// só reapresentados como tabela ordenável em vez de cards por pessoa;
// segue o filtro de período/geografia/operadores já ativo na página
// (nenhum pedido novo ao backend).
import { useMemo, useState } from "react";

function SortIcon({ active, asc }) {
  if (!active) return <span className="ml-1 text-slate-400">↕</span>;
  return <span className="ml-1 text-slate-700 dark:text-slate-200">{asc ? "▲" : "▼"}</span>;
}

function formatMedia(value) {
  return (Number(value) || 0).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function RankingTable({ title, individual, metricKey, diasKey, avgKey, metricLabel, color }) {
  const [sortCol, setSortCol] = useState("metric");
  const [sortAsc, setSortAsc] = useState(false);

  const rows = useMemo(() => {
    const list = (individual ?? [])
      .filter((o) => (o.kpis?.[metricKey] ?? 0) > 0)
      .map((o) => ({
        username: o.username || "—",
        tecnico: o.tecnico,
        metric: o.kpis?.[metricKey] ?? 0,
        dias: o.kpis?.[diasKey] ?? 0,
        media: o.kpis?.[avgKey] ?? 0,
      }));

    const getValue = (row, col) => (col === "metric" ? row.metric : col === "dias" ? row.dias : col === "media" ? row.media : row[col]);

    return [...list].sort((a, b) => {
      const av = getValue(a, sortCol);
      const bv = getValue(b, sortCol);
      if (typeof av === "string") return sortAsc ? av.localeCompare(bv, "pt") : bv.localeCompare(av, "pt");
      return sortAsc ? av - bv : bv - av;
    });
  }, [individual, metricKey, diasKey, avgKey, sortCol, sortAsc]);

  function toggleSort(col) {
    if (sortCol === col) {
      setSortAsc((a) => !a);
    } else {
      setSortCol(col);
      setSortAsc(col === "tecnico" || col === "username");
    }
  }

  const thClass = "px-3 py-2.5 text-left font-semibold text-white cursor-pointer select-none whitespace-nowrap hover:bg-white/10 transition-colors";

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-800 p-6">
      <h3 className="text-slate-800 dark:text-white font-semibold mb-4 border-l-4 pl-3" style={{ borderColor: color }}>
        {title}
      </h3>

      {!rows.length ? (
        <p className="text-slate-500 text-sm">Sem operadores no período selecionado.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-800 dark:bg-slate-950 rounded-lg">
                <th className="px-3 py-2.5 text-left font-semibold text-white whitespace-nowrap">#</th>
                <th className={thClass} onClick={() => toggleSort("username")}>
                  Nº EX <SortIcon active={sortCol === "username"} asc={sortAsc} />
                </th>
                <th className={thClass} onClick={() => toggleSort("tecnico")}>
                  Operador <SortIcon active={sortCol === "tecnico"} asc={sortAsc} />
                </th>
                <th className={thClass} onClick={() => toggleSort("metric")}>
                  {metricLabel} <SortIcon active={sortCol === "metric"} asc={sortAsc} />
                </th>
                <th className={thClass} onClick={() => toggleSort("dias")}>
                  Dias Trabalhados <SortIcon active={sortCol === "dias"} asc={sortAsc} />
                </th>
                <th className={thClass} onClick={() => toggleSort("media")}>
                  Média {metricLabel}/Dia <SortIcon active={sortCol === "media"} asc={sortAsc} />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {rows.map((r, i) => (
                <tr key={r.tecnico} className={i % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-slate-50 dark:bg-slate-900/60"}>
                  <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{i + 1}</td>
                  <td className="px-3 py-2 font-mono text-sky-600 dark:text-sky-400 whitespace-nowrap">{r.username}</td>
                  <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">{r.tecnico}</td>
                  <td className="px-3 py-2 font-semibold" style={{ color }}>{r.metric}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{r.dias}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{formatMedia(r.media)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
