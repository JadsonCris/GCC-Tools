// components/Charts/ThresholdTrendLine.jsx
import { useXScale, useYScale } from "@mui/x-charts/hooks";

/**
 * Linha de referência tracejada ligando o valor de threshold de cada
 * categoria (ex: 10% do total de incidentes do mês, no SLA2; 30% no
 * SLA3) — não é uma linha horizontal fixa, porque o threshold muda mês
 * a mês (10%/30% de um total diferente a cada mês). Desenhada como
 * `children` do <BarChart>, usando os mesmos hooks públicos de
 * BarValueLabels.jsx/LineValueLabels.jsx — sem "reference line" nativa
 * no MUI X Charts pra isto, então é um polyline SVG próprio, alinhado
 * ao centro de cada grupo de barras (mesmo x que useXScale já usa pro
 * eixo de categoria).
 */
export default function ThresholdTrendLine({ data, thresholdKey, categoryKey = "month", color = "#FAB138" }) {
  const xScale = useXScale();
  const yScale = useYScale();

  if (typeof xScale.bandwidth !== "function") return null;

  const points = data
    .map((row) => {
      const value = Number(row[thresholdKey]);
      if (Number.isNaN(value)) return null;
      const bandX = xScale(row[categoryKey]);
      if (bandX === undefined) return null;
      const x = bandX + xScale.bandwidth() / 2;
      const y = yScale(value);
      return `${x},${y}`;
    })
    .filter(Boolean)
    .join(" ");

  if (!points) return null;

  return (
    <g style={{ pointerEvents: "none" }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeDasharray="6 4" />
    </g>
  );
}
