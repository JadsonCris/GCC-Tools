// components/Charts/SimplePieChart.jsx
import { PieChart } from "@mui/x-charts/PieChart";

const DEFAULT_PALETTE = ["#4f7fff", "#0FA811", "#FAB138", "#E21B23", "#2B6CB0", "#F9E33B", "#30ADDE", "#212E3E"];

/**
 * Pie genérico (label/val), estilo "% dentro da fatia" igual ao
 * ToolsPieChartMui.jsx — usado nos 4 pies de Calls (Geografia/
 * Prioridade/Motivo/Tipo) em Major Incs, onde não há paleta fixa por
 * categoria como em Ferramentas. `colors` opcional: mapa label->hex
 * (ex: CALL_CATEGORY_COLORS); labels sem cor definida caem na paleta
 * default, por ordem.
 *
 * RESOLVIDO (bug real: legenda sobreposta ao gráfico com 4+ categorias,
 * ex: Prioridade P1-P4): a legenda embutida do MUI X (`slotProps.legend`)
 * vive dentro do próprio SVG, disputando espaço vertical fixo com o
 * donut — uma margem calculada por nº de itens (tentativa anterior)
 * ainda colidia em casos como uma fatia enorme (75%), cujo rótulo de
 * percentagem é desenhado perto da borda inferior do anel. Corrigido de
 * raiz: legenda do MUI X desligada (`legend.hidden`), substituída por
 * uma legenda própria em HTML/CSS por baixo do gráfico, em grelha de 2
 * colunas (mesmo padrão do PriorityChart.jsx/ToolChart.jsx) — cresce
 * SEMPRE por baixo do SVG (nunca disputa espaço com ele) e, em grelha,
 * usa metade das linhas de uma lista de 1 coluna, então também fica bem
 * mais compacta com muitas categorias.
 */
export default function SimplePieChart({ data = [], colors = {}, height = 190 }) {
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
    <div className="flex flex-col items-center gap-3">
      <PieChart
        height={height}
        margin={{ top: 10, bottom: 10, left: 10, right: 10 }}
        series={[
          {
            data: series,
            innerRadius: 24,
            outerRadius: 65,
            paddingAngle: 1.5,
            cornerRadius: 2,
            cx: "50%",
            cy: "50%",
            highlightScope: { fade: "global", highlight: "item" },
            arcLabel: (item) => (total > 0 ? `${Math.round((item.value / total) * 100)}%` : ""),
            arcLabelMinAngle: 20,
          },
        ]}
        sx={{ "& .MuiPieArcLabel-root": { fill: "#0f172a", fontSize: 10, fontWeight: 700 } }}
        slotProps={{ legend: { hidden: true } }}
      />
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 w-full">
        {series.map((s) => (
          <div key={s.id} className="flex items-center gap-1.5 min-w-0 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
            <span className="truncate">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
