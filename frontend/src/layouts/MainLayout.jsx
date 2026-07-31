import { Outlet, Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ShieldCheck,
  AlertTriangle,
  Users,
  Wrench,
  ClipboardList,
  ArrowLeft,
} from "lucide-react";

function MainLayout() {
  const location = useLocation();

  // Função de destaque idêntica ao padrão limpo do de Reports
  const isActive = (path) =>
    location.pathname === path
      ? "text-white font-semibold"
      : "text-slate-400 hover:text-slate-200 transition-colors";

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      
      {/* Sidebar Lateral - Padronizada */}
      <aside className="w-64 bg-slate-900 flex flex-col justify-between">
        <div>
          {/* Logo Header com a mesma altura do header principal (h-24), garantindo alinhamento da linha divisória */}
          <div className="h-24 flex items-center px-6 border-b border-slate-800">
            <span className="font-bold text-xl text-white tracking-wider">
              GCC DASHBOARD
            </span>
          </div>

          {/* Links de Navegação sem blocos cinzas de fundo */}
          <nav className="flex flex-col gap-5 p-6 text-sm">
            <Link to="/" className="text-slate-400 hover:text-slate-200 flex items-center gap-2 transition-colors">
              <ArrowLeft size={16} />
              Dashboard Home
            </Link>

            <div className="h-[1px] bg-slate-800 my-1"></div>

            <Link to="/services" className={`flex items-center gap-3 ${isActive("/services")}`}>
              <LayoutDashboard size={18} />
              Visão Geral
            </Link>
            <Link to="/services/sla" className={`flex items-center gap-3 ${isActive("/services/sla")}`}>
              <ShieldCheck size={18} />
              Report SLAs
            </Link>
            <Link to="/services/incidents" className={`flex items-center gap-3 ${isActive("/services/incidents")}`}>
              <AlertTriangle size={18} />
              Incidentes Ativos
            </Link>
            <Link to="/services/operators" className={`flex items-center gap-3 ${isActive("/services/operators")}`}>
              <Users size={18} />
              Escala de Operadores
            </Link>
            <Link to="/services/tools" className={`flex items-center gap-3 ${isActive("/services/tools")}`}>
              <Wrench size={18} />
              Status de Ferramentas
            </Link>
            <Link to="/services/operations" className={`flex items-center gap-3 ${isActive("/services/operations")}`}>
              <ClipboardList size={18} />
              Operações
            </Link>
          </nav>
        </div>

        {/* Rodapé da Sidebar */}
        <div className="p-6 text-xs text-slate-500">
          <span>Claranet GCC</span>
        </div>
      </aside>

      {/* Área de Conteúdo Principal */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        {/* Header Superior - Padronizado com Título, Data e Botão Azul Sólido */}
        <header className="h-24 border-b border-slate-800 bg-slate-950 flex items-center justify-between px-8 z-10">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-white tracking-tight">Service Dashboard</h1>
            <p className="text-xs text-slate-500">06 Julho 2026</p>
          </div>
          
          <Link 
            to="/" 
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-lg shadow-blue-600/10"
          >
            Dashboard Home
          </Link>
        </header>

        {/* Corpo da Página (Scrollável) */}
        <main className="flex-1 overflow-y-auto p-8 bg-slate-950">
          <Outlet />
        </main>
      </div>

    </div>
  );
}

export default MainLayout;