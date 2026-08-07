// components/Charts/DateAxisGroups.jsx
import { useXScale, useDrawingArea } from "@mui/x-charts/hooks";
import { useTheme } from "@mui/material/styles";

const MONTHS_PT_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function parseIsoDate(value) {
  if (typeof value !== "string") return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { year: y, month: m, day: d };
}

/**
 * 2ª e 3ª linha do eixo X pros gráficos diários (mês, depois ano),
 * imitando a hierarquia de datas do Power BI (dia/mês/ano) — o MUI X
 * Charts não tem eixo de datas agrupado nativo, então isto é um
 * overlay SVG próprio (mesmo padrão de BarValueLabels.jsx/
 * ThresholdTrendLine.jsx: hooks públicos useXScale/useDrawingArea, sem
 * depender de nada interno). Só faz sentido com `data` de datas reais
 * "YYYY-MM-DD" (ver TrendChart `groupedDateAxis`) — cada mês/ano abrange
 * a faixa de x entre o primeiro e o último dia dessa categoria
 * presentes no dataset (não o mês inteiro do calendário, já que os
 * dados são esparsos — só dias com evento real aparecem).
 */
export default function DateAxisGroups({ data, categoryKey = "date" }) {
  const theme = useTheme();
  const xScale = useXScale();
  const { top, height } = useDrawingArea();

  const isBand = typeof xScale.bandwidth === "function";
  const centerOf = (value) => {
    const x = xScale(value);
    if (x === undefined) return undefined;
    return isBand ? x + xScale.bandwidth() / 2 : x;
  };

  const monthGroups = [];
  const yearGroups = [];
  let curMonth = null;
  let curYear = null;

  data.forEach((row) => {
    const parsed = parseIsoDate(row[categoryKey]);
    if (!parsed) return;
    const x = centerOf(row[categoryKey]);
    if (x === undefined) return;

    const monthKey = `${parsed.year}-${parsed.month}`;
    if (!curMonth || curMonth.key !== monthKey) {
      curMonth = { key: monthKey, label: MONTHS_PT_SHORT[parsed.month - 1], start: x, end: x };
      monthGroups.push(curMonth);
    } else {
      curMonth.end = x;
    }

    const yearKey = String(parsed.year);
    if (!curYear || curYear.key !== yearKey) {
      curYear = { key: yearKey, label: yearKey, start: x, end: x };
      yearGroups.push(curYear);
    } else {
      curYear.end = x;
    }
  });

  if (!monthGroups.length) return null;

  const axisBottom = top + height;
  const textStyle = { fontSize: 11, textAnchor: "middle" };

  return (
    <g style={{ pointerEvents: "none" }}>
      {monthGroups.map((g) => (
        <text key={`m-${g.key}`} x={(g.start + g.end) / 2} y={axisBottom + 34} fill={theme.palette.text.secondary} {...textStyle}>
          {g.label}
        </text>
      ))}
      {yearGroups.map((g) => (
        <text key={`y-${g.key}`} x={(g.start + g.end) / 2} y={axisBottom + 50} fill={theme.palette.text.primary} fontWeight={600} {...textStyle}>
          {g.label}
        </text>
      ))}
    </g>
  );
}
