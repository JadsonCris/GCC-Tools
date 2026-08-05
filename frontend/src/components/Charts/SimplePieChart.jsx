// components/Charts/SimplePieChart.jsx
import { PieChart } from "@mui/x-charts/PieChart";
import { useTheme } from "@mui/material/styles";

const DEFAULT_PALETTE = ["#4f7fff", "#0FA811", "#FAB138", "#E21B23", "#2B6CB0", "#F9E33B", "#30ADDE", "#212E3E"];

/**
 * Pie genérico (label/val), estilo "% dentro da fatia" igual ao
 * ToolsPieChartMui.jsx — usado nos 4 pies de Calls (Geografia/
 * Prioridade/Motivo/Tipo) em Major Incs, onde não há paleta fixa por
 * categoria como em Ferramentas. `colors` opcional: mapa label->hex
 * (ex: CALL_CATEGORY_COLORS); labels sem cor definida caem na paleta
 * default, por ordem.
 */
export default function SimplePieChart({ data = [], colors = {}, height = 260 }) {
  const theme = useTheme();

  if (!data.length) {
    return <p className="text-slate-500 text-sm">Sem dados.</p>;
  }

  const total = data.reduce((sum, d) => sum + d.val, 0);
  const series = data.map((d, i) => ({
    id: d.label,
    value: d.val,
    label: d.label,
    color: colors[d.label] || DEFAULT_PALETTE[i % DEFAULT_PALETTE.length],
  }));

  return (
    <PieChart
      height={height}
      margin={{ top: 10, bottom: 70, left: 10, right: 10 }}
      series={[
        {
          data: series,
          innerRadius: 24,
          outerRadius: 65,
          paddingAngle: 1.5,
          cornerRadius: 2,
          cx: "50%",
          cy: 85,
          highlightScope: { fade: "global", highlight: "item" },
          arcLabel: (item) => (total > 0 ? `${Math.round((item.value / total) * 100)}%` : ""),
          arcLabelMinAngle: 20,
        },
      ]}
      sx={{ "& .MuiPieArcLabel-root": { fill: "#0f172a", fontSize: 10, fontWeight: 700 } }}
      slotProps={{
        legend: {
          direction: "column",
          position: { vertical: "bottom", horizontal: "middle" },
          padding: { top: 16 },
          labelStyle: { fill: theme.palette.text.secondary, fontSize: 10 },
        },
      }}
    />
  );
}
