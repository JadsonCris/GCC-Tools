// components/Charts/PriorityBarChartMui.jsx
import { BarChart } from "@mui/x-charts/BarChart";
import { useTheme } from "@mui/material/styles";
import BarValueLabels from "./BarValueLabels";

const SERIES = [{ dataKey: "val", label: "Incidentes" }];

export default function PriorityBarChartMui({ data = [] }) {
  const theme = useTheme();

  if (!data.length) {
    return <p className="text-slate-500 text-sm">Sem dados disponíveis.</p>;
  }

  const tickLabelStyle = { fill: theme.palette.text.secondary };
  // Mesma folga de 15% no teto do eixo Y que o TrendChart usa — sem
  // isso a barra mais alta encosta no topo e o rótulo (agora desenhado
  // por cima da barra, não dentro dela — ver BarValueLabels.jsx) fica
  // cortado.
  const maxValue = Math.max(0, ...data.map((d) => Number(d.val) || 0));
  const yAxisExtra = maxValue > 0 ? { max: maxValue * 1.15 } : { max: 1 };

  return (
    <BarChart
      height={280}
      dataset={data}
      xAxis={[
        {
          scaleType: "band",
          dataKey: "label",
          colorMap: { type: "ordinal", colors: data.map((d) => d.color) },
          tickLabelStyle,
        },
      ]}
      yAxis={[{ tickLabelStyle, ...yAxisExtra }]}
      series={SERIES}
      grid={{ horizontal: true }}
      margin={{ top: 24 }}
      sx={(theme) => ({
        "& .MuiChartsAxis-line, & .MuiChartsAxis-tick": { stroke: theme.palette.divider },
        "& .MuiChartsGrid-line": { stroke: theme.palette.divider },
      })}
      slotProps={{ legend: { hidden: true } }}
    >
      <BarValueLabels data={data} series={SERIES} categoryKey="label" />
    </BarChart>
  );
}
