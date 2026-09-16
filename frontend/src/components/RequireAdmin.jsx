// components/RequireAdmin.jsx
// Guarda de UX pras páginas "Gestão de Turnos"/"Base de Dados" — impede
// que alguém sem permissão veja a página ao ir direto ao URL, mesmo que
// o link já esteja escondido na sidebar (ver layouts/MainLayout.jsx). O
// bloqueio REAL é o 403 do backend (ver services/auth_service.py); isto
// é só para não mostrar UI que ia falhar de qualquer forma.
import { useCurrentUser } from "../hooks/useCurrentUser.js";

export default function RequireAdmin({ children }) {
  const { isAdmin, isLoading } = useCurrentUser();

  if (isLoading) {
    return <div className="p-8 text-center text-sm text-slate-400 dark:text-slate-500">A verificar permissões...</div>;
  }

  if (!isAdmin) {
    return (
      <div className="p-8 text-center max-w-md mx-auto">
        <h2 className="text-lg font-bold text-slate-700 dark:text-slate-200">Sem permissão</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
          Esta página está reservada a administradores. Se achas que devias ter acesso, fala com um administrador
          atual.
        </p>
      </div>
    );
  }

  return children;
}
