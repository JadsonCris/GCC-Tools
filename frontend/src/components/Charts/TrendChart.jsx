// components/Charts/TrendChart.jsx
import { LineChart } from "@mui/x-charts/LineChart";
import { BarChart } from "@mui/x-charts/BarChart";
import { useTheme } from "@mui/material/styles";
import BarValueLabels from "./BarValueLabels";
import LineValueLabels from "./LineValueLabels";
import ThresholdTrendLine from "./ThresholdTrendLine";
import DateAxisGroups from "./DateAxisGroups";

// Cores relativas ao tema MUI ativo (ver MuiThemeBridge em main.jsx) em
// vez de hex fixos, pra eixos/grelha/legenda ficarem legíveis nos dois
// modos (claro e escuro), não só no escuro original.
const chartSx = (theme) => ({
  "& .MuiChartsAxis-line, & .MuiChartsAxis-tick": { stroke: theme.palette.divider },
  "& .MuiChartsAxis-tickLabel": { fill: theme.palette.text.secondary },
  "& .MuiChartsGrid-line": { stroke: theme.palette.divider },
  "& .MuiChartsLegend-label": { fill: theme.palette.text.secondary },
});

// "2026-08-05" -> "5" — rótulo curto o suficiente pra o eixo conseguir
// mostrar TODOS os dias sem o MUI X descartar por sobreposição (ver
// `groupedDateAxis`), diferente do texto completo "YYYY-MM-DD", largo
// demais pra caber um por dia num gráfico com várias semanas de dados.
function dayOfMonthLabel(value) {
  if (typeof value !== "string") return value;
  const parts = value.split("-");
  return parts.length === 3 ? String(Number(parts[2])) : value;
}

/**
 * Gráfico de tendência mensal genérico (linha ou barra), reaproveitado
 * pelos vários painéis do Report SLAs (SLA1-4, Prioridade, Evento) —
 * réplica do dashboard "Service Level Management" original, um painel
 * por métrica em vez de um gráfico monolítico.
 *
 * Mostra sempre o valor de cada ponto/coluna (por cima, nunca centrado
 * dentro) — ver BarValueLabels.jsx (barras) e LineValueLabels.jsx
 * (linhas). O MUI X Charts não tem nada embutido pra isto: o `barLabel`
 * só sabe centrar dentro da barra, e o LineChart não tem equivalente
 * nenhum (só tooltip ao passar o rato, que continua ativo também).
 */
export default function TrendChart({
  data = [],
  series = [],
  type = "line",
  height = 300,
  thresholdKey,
  thresholdColor = "#FAB138",
  xKey = "month",
  valueFormatter,
  groupedDateAxis = false,
}) {
  const theme = useTheme();

  if (data.length === 0) {
    return <p className="text-slate-500 text-sm">Sem dados no período selecionado.</p>;
  }

  const Chart = type === "bar" ? BarChart : LineChart;
  const tickLabelStyle = { fill: theme.palette.text.secondary };

  // Quando TODOS os valores do período são 0 (ex: SLA4 sem nenhuma
  // quebra no período visível), o MUI X calcula uma escala degenerada
  // (min=max=0) e chega a desenhar vários ticks "0" sobrepostos no eixo
  // ("000000"). Forçar um teto mínimo evita esse glitch sem alterar o
  // eixo quando há dados reais. Quando há dados reais, o teto ganha 15%
  // de folga por cima do valor máximo — sem isso a barra mais alta
  // encosta no topo do gráfico e o rótulo (agora desenhado por cima da
  // barra, não dentro) fica cortado. Inclui o threshold no cálculo, pra
  // a linha de referência (ver ThresholdTrendLine.jsx) nunca ficar fora
  // da área visível.
  const valueKeys = thresholdKey ? [...series.map((s) => s.dataKey), thresholdKey] : series.map((s) => s.dataKey);
  const maxValue = Math.max(0, ...data.flatMap((row) => valueKeys.map((k) => Number(row[k]) || 0)));
  const yAxisExtra = maxValue > 0 ? { max: maxValue * 1.15 } : { max: 1 };

  return (
    <Chart
      height={height}
      dataset={data}
      xAxis={[{
        scaleType: type === "bar" ? "band" : "point",
        dataKey: xKey,
        tickLabelStyle,
        ...(groupedDateAxis ? { valueFormatter: dayOfMonthLabel } : {}),
      }]}
      yAxis={[{ tickLabelStyle, ...(valueFormatter ? { valueFormatter } : {}), ...yAxisExtra }]}
      series={series.map((s) => ({ curve: "linear", ...s }))}
      grid={{ horizontal: true }}
      margin={{ top: 24, bottom: groupedDateAxis ? 96 : 56 }}
      slotProps={{
        legend: {
          position: { vertical: "bottom", horizontal: "middle" },
          padding: { top: groupedDateAxis ? 56 : 16 },
        },
      }}
      sx={chartSx}
    >
      {type === "bar" ? (
        <BarValueLabels data={data} series={series} categoryKey={xKey} {...(valueFormatter ? { valueFormatter } : {})} />
      ) : (
        <LineValueLabels data={data} series={series} categoryKey={xKey} {...(valueFormatter ? { valueFormatter } : {})} />
      )}
      {thresholdKey && type === "bar" && (
        <ThresholdTrendLine data={data} thresholdKey={thresholdKey} categoryKey={xKey} color={thresholdColor} />
      )}
      {groupedDateAxis && <DateAxisGroups data={data} categoryKey={xKey} />}
    </Chart>
  );
}
