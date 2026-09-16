// components/Charts/BarValueLabels.jsx
import { useXScale, useYScale } from "@mui/x-charts/hooks";
import { useTheme } from "@mui/material/styles";

// Estimativa de largura de carácter a fontSize 11 / fontWeight 600
// (semi-bold) — não há como medir o texto real em SVG sem o desenhar
// primeiro, isto é só o suficiente pra decidir se dois rótulos vizinhos
// vão colidir.
const CHAR_WIDTH_PX = 6.6;
const MIN_HORIZONTAL_GAP = 3;

// Convenção de cor já usada em todo o projeto (SlaCard, SLA2 OK/NOK...):
// verde = bom, vermelho = mau. Quando os dois colidem, o verde ganha
// sempre — não faz sentido destacar o número "mau" só por ser
// igual/ligeiramente maior. Outras cores seguem o critério antigo
// (maior valor).
const GOOD_COLOR = "#0FA811";
const BAD_COLOR = "#E21B23";

function pickWinner(a, b) {
  if (a.color === BAD_COLOR && b.color === GOOD_COLOR) return b;
  if (a.color === GOOD_COLOR && b.color === BAD_COLOR) return a;
  return a.value >= b.value ? a : b;
}

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
 *
 * Quando barras vizinhas (mesma categoria ou categorias adjacentes) têm
 * rótulos largos demais pro espaço entre elas, os textos ficam colados
 * e ilegíveis — nesse caso só o rótulo do maior valor é mantido (pedido
 * do utilizador), varrendo todos os rótulos já ordenados da esquerda
 * pra direita.
 */
export default function BarValueLabels({ data, series, categoryKey = "month", valueFormatter = String }) {
  const theme = useTheme();
  const xScale = useXScale();
  const yScale = useYScale();

  if (typeof xScale.bandwidth !== "function") return null;

  const n = series.length;
  const gapRatio = 0.1;
  const bandwidth = xScale.bandwidth();
  const barWidth = bandwidth / (n + (n - 1) * gapRatio);
  const offset = gapRatio * barWidth;

  const candidates = [];
  data.forEach((row) => {
    const bandX = xScale(row[categoryKey]);
    if (bandX === undefined) return;
    series.forEach((s, i) => {
      const value = Number(row[s.dataKey]) || 0;
      if (!value) return;
      const text = valueFormatter(value);
      candidates.push({
        key: `${row[categoryKey]}-${s.dataKey}`,
        x: bandX + i * (barWidth + offset) + barWidth / 2,
        y: yScale(value) - 6,
        value,
        text,
        halfWidth: (text.length * CHAR_WIDTH_PX) / 2,
        color: s.color,
      });
    });
  });
  candidates.sort((a, b) => a.x - b.x);

  // Varrimento esquerda->direita: sempre que o próximo rótulo invadiria
  // o espaço do último mantido, fica só o de maior valor dos dois.
  const visible = [];
  for (const c of candidates) {
    const last = visible[visible.length - 1];
    if (last && c.x - c.halfWidth < last.x + last.halfWidth + MIN_HORIZONTAL_GAP) {
      visible[visible.length - 1] = pickWinner(last, c);
      continue;
    }
    visible.push(c);
  }

  return (
    <g style={{ pointerEvents: "none" }}>
      {visible.map((c) => (
        <text
          key={c.key}
          x={c.x}
          y={c.y}
          textAnchor="middle"
          fontSize={11}
          fontWeight={600}
          fill={c.color || theme.palette.text.primary}
        >
          {c.text}
        </text>
      ))}
    </g>
  );
}
