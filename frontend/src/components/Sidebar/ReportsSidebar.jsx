import { NavLink } from "react-router-dom";
import {
  FileText,
  Calendar,
  AlertOctagon,
  FileSpreadsheet,
  ArrowLeft
} from "lucide-react";

function ReportsSidebar() {
  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between h-screen">
      <div>
        {/* Header sincronizado com h-20 e o mesmo tamanho de texto */}
        <div className="h-20 flex items-center px-6 border-b border-slate-800">
          <h1 className="text-xl font-bold text-white">
            GCC Tools
          </h1>
        </div>

        {/* Menu de navegação padronizado */}
        <nav className="p-4 space-y-2">
          {/* Link para voltar para a Home do Portal */}
          <NavLink
            to="/"
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors text-sm mb-2"
          >
            <ArrowLeft size={18} />
            Dashboard Home
          </NavLink>

          <div className="h-[1px] bg-slate-800 my-2 mx-2"></div>

          <MenuItem
            to="/reports/report9"
            icon={<FileText size={18} />}
            title="Report 9 - Manhã"
          />

          <MenuItem
            to="/reports/cab"
            icon={<Calendar size={18} />}
            title="Report CAB"
          />

          <MenuItem
            to="/reports/critical"
            icon={<AlertOctagon size={18} />}
            title="Incidente Crítico"
          />

          <MenuItem
            to="/reports/p1"
            icon={<FileSpreadsheet size={18} />}
            title="Report P1 semanal"
          />
        </nav>
      </div>

      {/* Rodapé combinando com o padrão de distanciamento */}
      <div className="p-6 text-xs text-slate-500">
        <span>Claranet GCC</span>
      </div>
    </aside>
  );
}

// MenuItem reaproveitando exatamente a lógica e classes de estado ativo/inativo do outro Sidebar
function MenuItem({ icon, title, to }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `
        flex items-center gap-3
        w-full px-4 py-3 rounded-xl text-sm font-medium transition-colors
        ${
          isActive
            ? "bg-blue-600 text-white"
            : "text-slate-300 hover:bg-slate-800"
        }
      `
      }
    >
      {icon}
      {title}
    </NavLink>
  );
}

export default ReportsSidebar;