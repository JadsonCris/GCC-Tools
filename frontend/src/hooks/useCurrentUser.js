// hooks/useCurrentUser.js
import { useQuery } from "@tanstack/react-query";
import { getMe } from "../service/authApi";

/**
 * Identidade do utilizador atual (ver backend/services/auth_service.py).
 * `isAdmin`/`username` ficam `false`/`null` enquanto carrega ou se não
 * houver identidade nenhuma disponível — o comportamento por omissão é
 * sempre "esconder", nunca "mostrar", em caso de dúvida.
 */
export function useCurrentUser() {
  const { data, isLoading } = useQuery({
    queryKey: ["auth-me"],
    queryFn: getMe,
    staleTime: 5 * 60 * 1000,
  });
  return {
    username: data?.username ?? null,
    isAdmin: data?.is_admin ?? false,
    isLoading,
  };
}
