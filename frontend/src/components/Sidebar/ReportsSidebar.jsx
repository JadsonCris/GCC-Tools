import { NavLink } from "react-router-dom";
import {
  FileText,
  Calendar,
  FileSpreadsheet,
  ArrowLeft,
  Users,
  UserCog,
  Radar,
} from "lucide-react";

// Mesmo padrão visual da sidebar do MainLayout (GCC Dashboard): links de
// texto simples sem "pílula" de fundo, header h-24, nav com gap-5/p-6 —
// as duas sidebars da app devem parecer a mesma família, só muda o
// conteúdo do menu.
function ReportsSidebar() {
  return (
    <aside className="w-64 bg-white dark:bg-slate-900 flex flex-col justify-between border-r border-slate-200 dark:border-transparent">
      <div>
        <div className="h-24 flex items-center px-6 border-b border-slate-300 dark:border-slate-800">
          <span className="font-bold text-xl text-slate-800 dark:text-white tracking-wider">
            GCC TOOLS
          </span>
        </div>

        <nav className="flex flex-col gap-5 p-6 text-sm">
          <NavLink
            to="/"
            className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-2 transition-colors"
          >
            <ArrowLeft size={16} />
            Dashboard Home
          </NavLink>

          <div className="h-[1px] bg-slate-200 dark:bg-slate-800 my-1"></div>

          <MenuItem to="/reports/report9" icon={<FileText size={18} />} title="Report Ibéria / Brasil" />
          <MenuItem to="/reports/cab" icon={<Calendar size={18} />} title="Report CAB" />
          <MenuItem to="/reports/p1" icon={<FileSpreadsheet size={18} />} title="Report P1 semanal" />

          <div className="pt-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600 mb-3">
              Ponto Situação
            </p>
            <div className="flex flex-col gap-5">
              <MenuItem to="/reports/ponto-situacao/equipa" icon={<Users size={18} />} title="Equipa" />
              <MenuItem to="/reports/ponto-situacao/tl" icon={<UserCog size={18} />} title="TL's" />
            </div>
          </div>

          <div className="pt-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600 mb-3">
              Ferramentas
            </p>
            <div className="flex flex-col gap-5">
              <MenuItem to="/reports/splunk-validacao" icon={<Radar size={18} />} title="Splunk Validação" />
            </div>
          </div>
        </nav>
      </div>

      <div className="p-6 text-xs text-slate-400 dark:text-slate-500">
        <span>Claranet GCC</span>
      </div>
    </aside>
  );
}

// Mesma lógica de destaque ativo/inativo do MainLayout (texto colorido,
// sem fundo/pílula) — só varia com NavLink em vez de comparar
// location.pathname diretamente.
function MenuItem({ icon, title, to }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 transition-colors ${
          isActive
            ? "text-slate-800 dark:text-white font-semibold"
            : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
        }`
      }
    >
      {icon}
      {title}
    </NavLink>
  );
}

export default ReportsSidebar;
