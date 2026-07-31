import { useQuery } from "@tanstack/react-query";
import { getToolsBreakdown, getQualityMetrics } from "../service/dashboardApi";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

export default function Operations() {
  const { data: tools = [], isLoading } = useQuery({ queryKey: ["tools-breakdown"], queryFn: getToolsBreakdown });
  const { data: quality } = useQuery({ queryKey: ["quality"], queryFn: getQualityMetrics });

  // Mapeamento de Cores Dinâmicas para Operações
  const COLORS = ["#4f7fff", "#00e5a0", "#ffb84f", "#ff4f6b", "#a855f7"];

  return (
    <div className="bg-slate-900 rounded-2xl p-8 border border-slate-800 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Operações & Monitorização por Canal</h1>
        <p className="mt-1 text-slate-400">Distribuição volumétrica por ferramentas integradas e criticidade de turnos.</p>
      </div>

      {isLoading ? (
        <p className="text-slate-500">A processar fluxos do modelo...</p>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Métricas por Cartão de Aplicações do Power BI */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/60">
              <span className="text-xs text-slate-500 uppercase tracking-wider block">Canal IA (SCOM/ITM)</span>
              <span className="text-2xl font-black text-cyan-400">{quality?.ai_incidentes || 0}</span>
            </div>
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/60">
              <span className="text-xs text-slate-500 uppercase tracking-wider block">Operação Manual</span>
              <span className="text-2xl font-black text-slate-300">{quality?.manual_incidentes || 0}</span>
            </div>
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/60">
              <span className="text-xs text-slate-500 uppercase tracking-wider block">Justificações Aceites</span>
              <span className="text-2xl font-black text-emerald-400">{quality?.justificados || 0}</span>
            </div>
          </div>

          {/* Gráfico Analítico de Monitorização */}
          <div className="lg:col-span-2 bg-slate-950 p-6 rounded-xl border border-slate-800 h-64">
            <h4 className="text-sm font-semibold text-slate-400 mb-4">Volume Absoluto por Ferramenta Core</h4>
            <ResponsiveContainer width="100%" height="80%">
              <BarChart data={tools}>
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                <Tooltip cursor={{ fill: '#1e293b', opacity: 0.4 }} />
                <Bar dataKey="val" radius={[4, 4, 0, 0]}>
                  {tools.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}