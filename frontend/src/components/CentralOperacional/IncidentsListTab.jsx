// components/CentralOperacional/IncidentsListTab.jsx
// "Lista de Incidentes" (Lista CI's no protótipo v20) — todos os
// incidentes do período com quem abriu/resolveu e nº de CI's anexados.
// O backend devolve as linhas cruas do período (GET /dashboard/incidents-list);
// filtro, ordenação e exportação são feitos aqui, tudo local (mesmo
// padrão de renderAllLowCi() do protótipo).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { getIncidentsList } from "../../service/dashboardApi";

const selectClass =
  "px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200";

function incidentHref(number) {
  return `https://edpon.service-now.com/incident.do?sysparm_query=number=${encodeURIComponent(number)}`;
}

export default function IncidentsListTab({ range, region }) {
  const { data = [], isLoading, isError } = useQuery({
    queryKey: ["incidents-list", range?.start, range?.end, region],
    queryFn: () => getIncidentsList(range.start, range.end, region),
    enabled: !!range,
  });

  const [month, setMonth] = useState("__ALL__");
  const [operator, setOperator] = useState("__ALL__");
  const [resolver, setResolver] = useState("__ALL__");
  const [ciCount, setCiCount] = useState("__ALL__");
  const [sortColumn, setSortColumn] = useState("opened_at");
  const [sortAsc, setSortAsc] = useState(false);

  const months = useMemo(
    () => [...new Set(data.map((r) => (r.opened_at || "").slice(0, 7)).filter(Boolean))].sort(),
    [data]
  );
  const operators = useMemo(
    () => [...new Set(data.map((r) => r.opener).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt")),
    [data]
  );
  const resolvers = useMemo(
    () => [...new Set(data.map((r) => r.resolver).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt")),
    [data]
  );
  const ciCounts = useMemo(() => [...new Set(data.map((r) => r.ci_count))].sort((a, b) => a - b), [data]);

  const rows = useMemo(() => {
    let out = data;
    if (month !== "__ALL__") out = out.filter((r) => (r.opened_at || "").startsWith(month));
    if (operator !== "__ALL__") out = out.filter((r) => r.opener === operator);
    if (resolver !== "__ALL__") out = out.filter((r) => r.resolver === resolver);
    if (ciCount !== "__ALL__") out = out.filter((r) => String(r.ci_count) === ciCount);
    return [...out].sort((a, b) => {
      const va = a[sortColumn] ?? "";
      const vb = b[sortColumn] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "pt");
      return sortAsc ? cmp : -cmp;
    });
  }, [data, month, operator, resolver, ciCount, sortColumn, sortAsc]);

  function toggleSort(col) {
    if (sortColumn === col) setSortAsc((a) => !a);
    else {
      setSortColumn(col);
      setSortAsc(false);
    }
  }

  function exportXlsx() {
    if (!rows.length) return;
    const headers = ["Nº", "Abertura", "Descrição", "Quem abriu", "Quem resolveu", "Nº CI's", "CI mais recente"];
    const body = rows.map((r) => [
      r.number, r.opened_at, r.short_description, r.opener, r.resolver, r.ci_count, r.latest_ci_at,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...body]);
    ws["!cols"] = [{ wch: 12 }, { wch: 16 }, { wch: 55 }, { wch: 22 }, { wch: 22 }, { wch: 10 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Lista de Incidentes");
    XLSX.writeFile(wb, `lista_incidentes_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const COLUMNS = [
    { key: "number", label: "Nº" },
    { key: "opened_at", label: "Abertura" },
    { key: "short_description", label: "Descrição" },
    { key: "opener", label: "Quem abriu" },
    { key: "resolver", label: "Quem resolveu" },
    { key: "ci_count", label: "Nº CI's" },
    { key: "latest_ci_at", label: "CI mais recente" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={month} onChange={(e) => setMonth(e.target.value)} className={selectClass}>
          <option value="__ALL__">Todos os meses</option>
          {months.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <select value={operator} onChange={(e) => setOperator(e.target.value)} className={selectClass}>
          <option value="__ALL__">Quem abriu: todos</option>
          {operators.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <select value={resolver} onChange={(e) => setResolver(e.target.value)} className={selectClass}>
          <option value="__ALL__">Quem resolveu: todos</option>
          {resolvers.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select value={ciCount} onChange={(e) => setCiCount(e.target.value)} className={selectClass}>
          <option value="__ALL__">Nº de CI's: todos</option>
          {ciCounts.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={exportXlsx}
          disabled={!rows.length}
          className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
        >
          ⬇ Extrair lista apresentada
        </button>
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500">
        {isLoading ? "A carregar..." : `${rows.length} de ${data.length} incidente(s) no período selecionado.`}
      </p>

      {isError && <p className="text-rose-500 dark:text-rose-400 text-sm">Erro ao carregar a lista de incidentes.</p>}

      {!isLoading && !isError && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-800 overflow-auto max-h-[560px]">
          <table className="w-full text-left border-collapse text-sm">
            <thead className="sticky top-0 bg-white dark:bg-slate-900">
              <tr className="border-b border-slate-300 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs uppercase font-semibold">
                {COLUMNS.map((c) => (
                  <th key={c.key} onClick={() => toggleSort(c.key)} className="py-3 px-3 cursor-pointer whitespace-nowrap select-none">
                    {c.label} {sortColumn === c.key && (sortAsc ? "▲" : "▼")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {rows.map((r) => (
                <tr key={r.number}>
                  <td className="py-2 px-3 font-mono whitespace-nowrap">
                    <a href={incidentHref(r.number)} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                      {r.number}
                    </a>
                  </td>
                  <td className="py-2 px-3 text-slate-500 dark:text-slate-400 font-mono whitespace-nowrap">{r.opened_at ?? "—"}</td>
                  <td className="py-2 px-3 text-slate-700 dark:text-slate-200 max-w-sm truncate" title={r.short_description}>
                    {r.short_description || "—"}
                  </td>
                  <td className="py-2 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{r.opener || "—"}</td>
                  <td className="py-2 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{r.resolver || "—"}</td>
                  <td className="py-2 px-3 text-center font-mono">{r.ci_count}</td>
                  <td className="py-2 px-3 text-slate-400 font-mono whitespace-nowrap">{r.latest_ci_at ?? "—"}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={COLUMNS.length} className="py-6 text-center text-slate-400 text-sm">
                    Sem incidentes para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
