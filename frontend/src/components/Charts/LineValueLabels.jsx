// components/Charts/LineValueLabels.jsx
import { useXScale, useYScale } from "@mui/x-charts/hooks";
import { useTheme } from "@mui/material/styles";

const MIN_VERTICAL_GAP = 14; // px — abaixo disto, dois rótulos na mesma categoria seriam ilegíveis sobrepostos

// Convenção de cor já usada em todo o projeto (SlaCard, gráficos de
// SLA1/SLA2...): verde = bom (OK/Com Justificações), vermelho = mau
// (NOK/Sem Justificações). Quando os dois colidem, o verde ganha sempre
// — não faz sentido destacar o número "mau" só porque calhou de ser
// igual/ligeiramente maior. Outras cores (sem esse significado) seguem
// o critério antigo (maior valor).
const GOOD_COLOR = "#0FA811";
const BAD_COLOR = "#E21B23";

function pickWinner(a, b) {
  if (a.s.color === BAD_COLOR && b.s.color === GOOD_COLOR) return b;
  if (a.s.color === GOOD_COLOR && b.s.color === BAD_COLOR) return a;
  return a.value >= b.value ? a : b;
}

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
 *
 * Dois ajustes visuais (pedido do utilizador, rótulos coladas ao eixo e
 * sobrepostas entre si):
 * 1. No primeiro/último ponto de cada linha, o texto (centrado por
 *    omissão) passa a alinhar pra dentro do gráfico (`start`/`end` em
 *    vez de `middle`), pra não ficar meio cortado em cima do eixo Y.
 * 2. Quando duas séries têm valores próximos na mesma categoria (pontos
 *    a menos de MIN_VERTICAL_GAP px um do outro), só o rótulo do maior
 *    valor é desenhado — dois números colados são ilegíveis de qualquer
 *    forma, e o maior é o mais relevante.
 */
export default function LineValueLabels({ data, series, categoryKey = "month", valueFormatter = String }) {
  const theme = useTheme();
  const xScale = useXScale();
  const yScale = useYScale();

  return (
    <g style={{ pointerEvents: "none" }}>
      {data.map((row, rowIndex) => {
        const x = xScale(row[categoryKey]);
        if (x === undefined) return null;

        const points = series
          .map((s) => {
            const raw = row[s.dataKey];
            const value = Number(raw);
            // RESOLVIDO (pedido do utilizador): valor 0 não leva rótulo —
            // o dia continua no eixo/linha (ver MUI X, não mexido aqui),
            // só o texto "0:00:00"/"0" repetido em toda categoria vazia
            // é que não interessa mostrar (mesmo critério que
            // BarValueLabels.jsx já usa pras barras, ver `if (!value)`).
            if (raw === null || raw === undefined || Number.isNaN(value) || value === 0) return null;
            return { s, value, y: yScale(value) };
          })
          .filter(Boolean)
          .sort((a, b) => a.y - b.y); // de cima (maior valor) pra baixo (menor valor)

        const visible = [];
        points.forEach((p) => {
          const lastIdx = visible.length - 1;
          const prev = visible[lastIdx];
          if (prev && Math.abs(p.y - prev.y) < MIN_VERTICAL_GAP) {
            visible[lastIdx] = pickWinner(prev, p);
            return;
          }
          visible.push(p);
        });

        const isFirst = rowIndex === 0;
        const isLast = rowIndex === data.length - 1;
        const anchor = isFirst ? "start" : isLast ? "end" : "middle";
        const dx = isFirst ? 5 : isLast ? -5 : 0;

        return visible.map(({ s, value, y }) => (
          <text
            key={`${row[categoryKey]}-${s.dataKey}`}
            x={x + dx}
            y={y - 12}
            textAnchor={anchor}
            fontSize={11}
            fontWeight={600}
            fill={s.color || theme.palette.text.primary}
          >
            {valueFormatter(value)}
          </text>
        ));
      })}
    </g>
  );
}
