// components/Charts/ToolsPieChartMui.jsx
import { PieChart } from "@mui/x-charts/PieChart";
import { useTheme } from "@mui/material/styles";

export default function ToolsPieChartMui({ data = [] }) {
  const theme = useTheme();

  if (!data.length) {
    return <p className="text-slate-500 text-sm">Sem dados disponíveis.</p>;
  }

  const total = data.reduce((sum, d) => sum + d.val, 0);
  const series = data.map((d) => ({
    id: d.name,
    value: d.val,
    label: d.name,
    color: d.color,
  }));

  return (
    <PieChart
      height={280}
      series={[
        {
          data: series,
          innerRadius: 45,
          outerRadius: 110,
          paddingAngle: 1.5,
          cornerRadius: 2,
          highlightScope: { fade: "global", highlight: "item" },
          // Percentagem em cada slice (estilo MUI X "Titanic Survival
          // Statistics") — só mostra o rótulo em slices grandes o
          // suficiente pra caber o texto (arcLabelMinAngle), pra não
          // amontoar texto em fatias minúsculas.
          arcLabel: (item) => (total > 0 ? `${Math.round((item.value / total) * 100)}%` : ""),
          arcLabelMinAngle: 20,
        },
      ]}
      sx={{
        "& .MuiPieArcLabel-root": { fill: "#0f172a", fontSize: 12, fontWeight: 700 },
      }}
      slotProps={{
        legend: {
          direction: "column",
          position: { vertical: "middle", horizontal: "right" },
          labelStyle: { fill: theme.palette.text.secondary, fontSize: 12 },
        },
      }}
    />
  );
}
