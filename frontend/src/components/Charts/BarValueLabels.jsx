// components/Charts/BarValueLabels.jsx
import { useXScale, useYScale } from "@mui/x-charts/hooks";
import { useTheme } from "@mui/material/styles";

/**
 * Rótulo de valor SEMPRE por cima de cada barra (fora dela, não
 * centrado dentro) — o `barLabel` embutido do MUI X Charts não suporta
 * isso: confirmado no código-fonte instalado
 * (BarChart/BarLabel/BarLabelPlot.js) que a posição é sempre fixa no
 * centro exato da barra (x+width/2, y+height/2), sem prop pública pra
 * mudar. Este componente desenha os rótulos por cima, usado como
 * `children` do <BarChart>.
 *
 * Reproduz a MESMA fórmula que o MUI X usa internamente pra dividir o
 * espaço entre barras do mesmo grupo/categoria (BarChart/BarPlot.js,
 * função getBandSize, com o gapRatio 0.1 que é o default da biblioteca
 * — internals/computeAxisValue.js, DEFAULT_BAR_GAP_RATIO) — só com
 * hooks públicos (useXScale/useYScale), sem depender de nada interno.
 */
export default function BarValueLabels({ data, series, categoryKey = "month" }) {
  const theme = useTheme();
  const xScale = useXScale();
  const yScale = useYScale();

  if (typeof xScale.bandwidth !== "function") return null;

  const n = series.length;
  const gapRatio = 0.1;
  const bandwidth = xScale.bandwidth();
  const barWidth = bandwidth / (n + (n - 1) * gapRatio);
  const offset = gapRatio * barWidth;

  return (
    <g style={{ pointerEvents: "none" }}>
      {data.map((row) =>
        series.map((s, i) => {
          const value = Number(row[s.dataKey]) || 0;
          if (!value) return null;
          const bandX = xScale(row[categoryKey]);
          if (bandX === undefined) return null;
          const x = bandX + i * (barWidth + offset) + barWidth / 2;
          const y = yScale(value) - 6;
          return (
            <text
              key={`${row[categoryKey]}-${s.dataKey}`}
              x={x}
              y={y}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill={theme.palette.text.primary}
            >
              {value}
            </text>
          );
        })
      )}
    </g>
  );
}
