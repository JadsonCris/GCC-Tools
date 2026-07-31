import { useQuery } from "@tanstack/react-query";
import { getQualityMetrics } from "../service/dashboardApi";
import KPICard from "../components/KPI/KPICard";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

export default function Quality() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["qualityMetrics"],
    queryFn: getQualityMetrics,
  });

  if (isLoading) return <div className="p-8 text-slate-500 font-mono">A calcular auditoria de chaves...</div>;
  if (isError) return <div className="p-8 text-rose-400">Erro ao ligar ao serviço de qualidade.</div>;

  const automationData = [
    { name: "IA / SCOM", value: data?.ai_incidentes || 0, color: "#06b6d4" },
    { name: "Manual", value: data?.manual_incidentes || 0, color: "#94a3b8" },
  ];

  const complianceData = [
    { name: "Conforme (OK)", value: data?.ok_count || 0, color: "#10b981" },
    { name: "Inconforme (NOK)", value: data?.nok_count || 0, color: "#f59e0b" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Qualidade e Automação</h1>
          <p className="text-sm text-slate-400 mt-0.5">Cruzamento analítico de conformidades (Filtro OK) e chaves de auditoria.</p>
        </div>
      </div>

      {/* Grid de KPIs Expandidos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Taxa de Automação" value={`${data?.taxa_automacao || 0}%`} color="text-cyan-400" />
        <KPICard title="Incidentes por IA" value={data?.ai_incidentes} color="text-teal-400" />
        <KPICard title="Justificações Aceites" value={data?.justificados} color="text-indigo-400" />
        <KPICard title="Volume Inconforme (NOK)" value={data?.nok_count} color="text-amber-500 font-bold" />
      </div>

      {/* Distribuições Visuais em Recharts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 h-80 flex flex-col justify-between">
          <h3 className="text-white font-semibold text-sm">Origem de Incidentes (IA vs Manual)</h3>
          <div className="flex-1 min-h-0 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={automationData} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={4} dataKey="value">
                  {automationData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", color: "#fff" }} />
                <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 h-80 flex flex-col justify-between">
          <h3 className="text-white font-semibold text-sm">Auditoria Operacional (Registos OK / NOK)</h3>
          <div className="flex-1 min-h-0 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={complianceData} cx="50%" cy="50%" outerRadius={75} dataKey="value">
                  {complianceData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", color: "#fff" }} />
                <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}