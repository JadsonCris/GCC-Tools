import { useQuery } from "@tanstack/react-query";
import { getSla3Detailed, getSla4Detailed, getBacklogSummary, getDespromovidosSummary } from "../service/dashboardApi";
import KPICard from "../components/KPI/KPICard";
import { AlertTriangle, Clock } from "lucide-react";

export default function AdvancedSla() {
  const { data: sla3 } = useQuery({ queryKey: ["sla3-detailed"], queryFn: getSla3Detailed });
  const { data: sla4 } = useQuery({ queryKey: ["sla4-detailed"], queryFn: getSla4Detailed });
  const { data: backlog } = useQuery({ queryKey: ["backlog-summary"], queryFn: getBacklogSummary });
  const { data: desp } = useQuery({ queryKey: ["despromovidos-summary"], queryFn: getDespromovidosSummary });

  const isBacklogCritical = (backlog?.backlog_total || 0) > 150;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">SLA Avançado & Backlog Acumulado</h1>
        <p className="text-sm text-slate-400 mt-0.5">Métricas complexas importadas do TMDL em tempo real.</p>
      </div>

      {/* Cartões Base */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="SLA 3.0 Cumprido" value={`${sla3?.sla3_pct || 100}%`} color="text-emerald-400" />
        <KPICard title="Incidentes Acumulados" value={backlog?.backlog_incidentes} color="text-rose-400" />
        <KPICard title="Pedidos RITM Pendentes" value={backlog?.backlog_ritm} color="text-pink-400" />
        <KPICard title="Quebras SLA 4.0" value={sla4?.sla4_count} color="text-amber-500" />
      </div>

      {/* Bloco de Monitorização Crítica de Backlog */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900 rounded-2xl p-6 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Clock className="text-blue-400" size={18} />
              Distribuição de Fila Viva (ServiceNow Queue)
            </h3>
            <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded-full ${
              isBacklogCritical ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
            }`}>
              STATUS: {isBacklogCritical ? "CRÍTICO" : "NOMINAL"}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/50">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">SLA 3.0 Alvo</p>
              <p className="text-2xl font-black text-slate-300 mt-1">{sla3?.target_value || "92.0"}%</p>
            </div>
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/50">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Achieved (Sucessos)</p>
              <p className="text-2xl font-black text-emerald-400 mt-1">{sla3?.achieved || 0}</p>
            </div>
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/50">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">Violados</p>
              <p className="text-2xl font-black text-rose-400 mt-1">{sla3?.not_achieved || 0}</p>
            </div>
          </div>
        </div>

        {/* Alertas de Despromoção P1 */}
        <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 flex flex-col justify-between">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <AlertTriangle className="text-amber-500" size={18} />
              Incidentes Despromovidos (Downgrades)
            </h3>
            <p className="text-xs text-slate-400">
              Alertas gerados quando um P1 crítico é alterado para prioridades mais baixas após triagem.
            </p>
          </div>

          <div className="mt-4 bg-slate-950 rounded-xl p-4 border border-slate-800/40 text-center">
            <span className="text-xs text-slate-500 uppercase block tracking-wider font-medium">Contagem de Incidentes</span>
            <span className="text-4xl font-black text-amber-500 font-mono mt-1 block">
              {desp?.p1_despromovidos_count || 0}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}