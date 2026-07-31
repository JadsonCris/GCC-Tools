import { useSLAMetrics } from "../hooks/useDashboard";

function SLA() {
  const { data, isLoading, isError, error, refetch } = useSLAMetrics();

  // 1. Estado de Carregamento (Skeleton Screen)
  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-slate-800 rounded w-1/4"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2].map((i) => (
            <div key={i} className="h-40 bg-slate-800 rounded-xl"></div>
          ))}
        </div>
      </div>
    );
  }

  // 2. Estado de Erro
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-96 border border-red-500/20 bg-red-500/5 rounded-xl p-8 text-center">
        <div className="text-red-400 text-xl font-semibold mb-2">Falha ao carregar dados de SLA</div>
        <p className="text-slate-400 text-sm max-w-md mb-6">
          {error?.message || "Não foi possível conectar ao servidor para buscar as métricas do ServiceNow."}
        </p>
        <button 
          onClick={() => refetch()} 
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors border border-slate-700"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  // Extração dos dados reais vindo do backend (com fallbacks seguros)
  const sla3 = data?.sla3 || { achieved: 0, not_achieved: 0, justificados: 0, sla3_pct: 0, target: 70 };
  const sla4 = data?.sla4 || { sla4_not_achieved: 0, sla4_justificados: 0, threshold_minutes: 3 };

  // Determinar cores dinâmicas baseadas na meta do SLA3
  const isSla3Met = sla3.sla3_pct >= sla3.target;

  return (
    <div className="space-y-8">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Acordos de Nível de Serviço (SLA)</h2>
          <p className="text-sm text-slate-400 mt-1">Métricas em tempo real calculadas a partir das tabelas SLA3 e SLA4.</p>
        </div>
      </div>

      {/* Grid Principal de Blocos Operacionais */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Painel SLA3 - Incidentes */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-md flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Métricas SLA3 (Incidentes)</span>
              <span className="text-xs text-slate-500">Meta: {sla3.target}%</span>
            </div>
            
            <div className="flex items-baseline gap-2 mt-4">
              <span className={`text-4xl font-black tracking-tight ${isSla3Met ? "text-emerald-400" : "text-amber-500"}`}>
                {sla3.sla3_pct}%
              </span>
              <span className="text-xs text-slate-400">de conformidade</span>
            </div>

            {/* Barra de Progresso Visual */}
            <div className="mt-4 w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${isSla3Met ? "bg-emerald-500" : "bg-amber-500"}`} 
                style={{ width: `${Math.min(sla3.sla3_pct, 100)}%` }}
              ></div>
            </div>

            {/* Sub-métricas detalhadas */}
            <div className="grid grid-cols-3 gap-2 mt-6 pt-4 border-t border-slate-800/60 text-center">
              <div>
                <div className="text-xl font-bold text-white">{sla3.achieved}</div>
                <div className="text-[10px] text-slate-400 uppercase font-medium mt-1">Cumpridos</div>
              </div>
              <div>
                <div className="text-xl font-bold text-rose-500">{sla3.not_achieved}</div>
                <div className="text-[10px] text-slate-400 uppercase font-medium mt-1">Violados</div>
              </div>
              <div>
                <div className="text-xl font-bold text-blue-400">{sla3.justificados}</div>
                <div className="text-[10px] text-slate-400 uppercase font-medium mt-1">Justificados</div>
              </div>
            </div>
          </div>
        </div>

        {/* Painel SLA4 - Tasks */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-md flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Métricas SLA4 (Tasks)</span>
              <span className="text-xs text-slate-500">Tolerância: {sla4.threshold_minutes} min</span>
            </div>

            <div className="flex items-baseline gap-2 mt-4">
              <span className={`text-4xl font-black tracking-tight ${sla4.sla4_not_achieved > 0 ? "text-rose-500" : "text-slate-300"}`}>
                {sla4.sla4_not_achieved}
              </span>
              <span className="text-xs text-slate-400">Tasks Fora do Prazo</span>
            </div>

            <p className="text-xs text-slate-400 mt-3 leading-relaxed">
              Contagem de registros únicos onde o tempo limite operacional foi ultrapassado e não há justificativas aplicadas.
            </p>

            {/* Sub-métricas detalhadas */}
            <div className="grid grid-cols-2 gap-2 mt-6 pt-5 border-t border-slate-800/60 text-center">
              <div>
                <div className="text-xl font-bold text-rose-400">{sla4.sla4_not_achieved}</div>
                <div className="text-[10px] text-slate-400 uppercase font-medium mt-1">Não Cumpridos</div>
              </div>
              <div>
                <div className="text-xl font-bold text-blue-400">{sla4.sla4_justificados}</div>
                <div className="text-[10px] text-slate-400 uppercase font-medium mt-1">Justificados</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default SLA;