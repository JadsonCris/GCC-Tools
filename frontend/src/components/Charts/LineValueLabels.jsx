// components/Charts/LineValueLabels.jsx
import { useXScale, useYScale } from "@mui/x-charts/hooks";
import { useTheme } from "@mui/material/styles";

/**
 * Mesma ideia do BarValueLabels.jsx, mas pra LineChart: o MUI X não tem
 * nenhum equivalente embutido a "barLabel" pra linhas (só o tooltip ao
 * passar o rato) — este componente desenha o valor por cima de cada
 * ponto, sempre visível, usando os hooks públicos useXScale/useYScale.
 *
 * Mais simples que o BarValueLabels: o eixo X de uma LineChart usa
 * escala "point" (não "band"), que já devolve a posição exata de cada
 * ponto — sem precisar de repartir espaço entre séries vizinhas como
 * nas barras agrupadas.
 */
export default function LineValueLabels({ data, series, categoryKey = "month", valueFormatter = String }) {
  const theme = useTheme();
  const xScale = useXScale();
  const yScale = useYScale();

  return (
    <g style={{ pointerEvents: "none" }}>
      {data.map((row) =>
        series.map((s) => {
          const raw = row[s.dataKey];
          const value = Number(raw);
          if (raw === null || raw === undefined || Number.isNaN(value)) return null;
          const x = xScale(row[categoryKey]);
          if (x === undefined) return null;
          const y = yScale(value);
          return (
            <text
              key={`${row[categoryKey]}-${s.dataKey}`}
              x={x}
              y={y - 12}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill={s.color || theme.palette.text.primary}
            >
              {valueFormatter(value)}
            </text>
          );
        })
      )}
    </g>
  );
}
