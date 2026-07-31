import { useQuery } from "@tanstack/react-query";
import api from "../service/api.js";

// Hook para buscar métricas gerais (Incidentes, RITMs, Backlog)
export function useServiceMetrics() {
  return useQuery({
    queryKey: ["serviceMetrics"],
    queryFn: async () => {
      const response = await api.get("/dashboard/kpis"); // alinhado com o router real do backend
      return response.data;
    },
    refetchInterval: 60000, // Atualiza automaticamente a cada 1 minuto
  });
}

// Hook para buscar os relatórios de SLA
export function useSLAMetrics() {
  return useQuery({
    queryKey: ["slaMetrics"],
    queryFn: async () => {
      const response = await api.get("/sla"); // era "/services/sla" (404) — o router do backend expõe /api/sla
      return response.data;
    },
  });
}