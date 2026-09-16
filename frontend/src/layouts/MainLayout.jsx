import { Outlet, Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ShieldCheck,
  Activity,
  ArrowLeft,
  Bot,
  Siren,
  CalendarDays,
  Database,
} from "lucide-react";
import { DateRangeProvider } from "../context/DateRangeContext.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import { useCurrentUser } from "../hooks/useCurrentUser.js";

function MainLayout() {
  const location = useLocation();
  const { isAdmin } = useCurrentUser();

  // Função de destaque idêntica ao padrão limpo do de Reports
  const isActive = (path) =>
    location.pathname === path
      ? "text-slate-800 dark:text-white font-semibold"
      : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors";

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans overflow-hidden">

      {/* Sidebar Lateral - Padronizada */}
      <aside className="w-64 bg-white dark:bg-slate-900 flex flex-col justify-between border-r border-slate-200 dark:border-transparent">
        <div>
          {/* Logo Header com a mesma altura do header principal (h-24), garantindo alinhamento da linha divisória */}
          <div className="h-24 flex items-center px-6 border-b border-slate-300 dark:border-slate-800">
            <span className="font-bold text-xl text-slate-800 dark:text-white tracking-wider">
              GCC DASHBOARD
            </span>
          </div>

          {/* Links de Navegação sem blocos cinzas de fundo */}
          <nav className="flex flex-col gap-5 p-6 text-sm">
            <Link to="/" className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-2 transition-colors">
              <ArrowLeft size={16} />
              Dashboard Home
            </Link>

            <div className="h-[1px] bg-slate-200 dark:bg-slate-800 my-1"></div>

            <Link to="/services" className={`flex items-center gap-3 ${isActive("/services")}`}>
              <LayoutDashboard size={18} />
              Visão Geral
            </Link>
            <Link to="/services/sla" className={`flex items-center gap-3 ${isActive("/services/sla")}`}>
              <ShieldCheck size={18} />
              Report SLAs
            </Link>
            <Link
              to="/services/central-operacional"
              className={`flex items-center gap-3 ${isActive("/services/central-operacional")}`}
            >
              <Activity size={18} />
              Central Operacional
            </Link>
            <Link to="/services/aioper" className={`flex items-center gap-3 ${isActive("/services/aioper")}`}>
              <Bot size={18} />
              AIOPER
            </Link>
            <Link to="/services/major-incs" className={`flex items-center gap-3 ${isActive("/services/major-incs")}`}>
              <Siren size={18} />
              Major Incs
            </Link>
            {isAdmin && (
              <>
                <Link to="/services/turnos" className={`flex items-center gap-3 ${isActive("/services/turnos")}`}>
                  <CalendarDays size={18} />
                  Gestão de Turnos
                </Link>
                <Link to="/services/database" className={`flex items-center gap-3 ${isActive("/services/database")}`}>
                  <Database size={18} />
                  Base de Dados
                </Link>
              </>
            )}
          </nav>
        </div>

        {/* Rodapé da Sidebar */}
        <div className="p-6 text-xs text-slate-400 dark:text-slate-500">
          <span>Claranet GCC</span>
        </div>
      </aside>

      {/* Área de Conteúdo Principal */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header Superior - Padronizado com Título, Data e Botão Azul Sólido */}
        <header className="h-24 border-b border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 flex items-center justify-between px-8 z-10">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">Service Dashboard</h1>
            <p className="text-xs text-slate-400 dark:text-slate-500">06 Julho 2026</p>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              to="/"
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-lg shadow-blue-600/10"
            >
              Dashboard Home
            </Link>
          </div>
        </header>

        {/* Corpo da Página (Scrollável) */}
        <main className="flex-1 overflow-y-auto p-8 bg-slate-100 dark:bg-slate-950">
          <DateRangeProvider>
            <Outlet />
          </DateRangeProvider>
        </main>
      </div>

    </div>
  );
}

export default MainLayout;