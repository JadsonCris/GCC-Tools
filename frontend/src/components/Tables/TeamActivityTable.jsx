// components/Tables/TeamActivityTable.jsx
// Incidentes abertos + tags "OK_GCC" feitas por cada técnico, no
// período selecionado — ver backend/services/team_service.py.
export default function TeamActivityTable({ data = [] }) {
  if (!data.length) {
    return <p className="text-slate-500 text-sm">Sem dados no período selecionado.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-300 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">
            <th className="pb-3 pr-4">Técnico</th>
            <th className="pb-3 px-4 text-center">Incidentes Abertos</th>
            <th className="pb-3 pl-4 text-center">Tags OK</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
          {data.map((row) => (
            <tr key={row.tecnico}>
              <td className="py-3 pr-4 font-medium text-slate-700 dark:text-slate-200">{row.tecnico}</td>
              <td className="py-3 px-4 text-center text-slate-600 dark:text-slate-300 font-bold">{row.incidentes_abertos}</td>
              <td className="py-3 pl-4 text-center font-bold" style={{ color: "#0FA811" }}>{row.tags_ok}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
