// components/Tables/OperatorsTable.jsx

export default function OperatorsTable({
  data
}) {
  return (
    <table className="w-full text-sm">

      <thead>

        <tr className="border-b border-slate-700">
          <th className="text-left py-2">
            Operador
          </th>

          <th className="text-right py-2">
            Incidentes
          </th>
        </tr>

      </thead>

      <tbody>

        {data.map((item, index) => (

          <tr
            key={index}
            className="border-b border-slate-800"
          >
            <td className="py-2">
              {item.name}
            </td>

            <td className="text-right">
              {item.incidents}
            </td>
          </tr>

        ))}

      </tbody>

    </table>
  );
}