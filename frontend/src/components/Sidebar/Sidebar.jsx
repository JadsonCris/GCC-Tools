import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  AlertTriangle,
  ShieldCheck,
  Users,
  Wrench,
  ClipboardList,
  CheckCircle2,
  Layers
} from "lucide-react";

export default function Sidebar() {
  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between h-screen">
      <div>
        <div className="h-20 flex items-center px-6 border-b border-slate-800">
          <h1 className="text-xl font-bold text-white tracking-tight">
            Claranet Service
          </h1>
        </div>

        <nav className="p-4 space-y-1">
          <MenuItem to="/services" end icon={<LayoutDashboard size={18} />} title="Dashboard" />
          <MenuItem to="/services/sla" icon={<ShieldCheck size={18} />} title="SLA Clássico" />
          <MenuItem to="/services/advanced-sla" icon={<Layers size={18} />} title="SLA 3.0 / Backlog" />
          <MenuItem to="/services/quality" icon={<CheckCircle2 size={18} />} title="Qualidade & IA" />
          <MenuItem to="/services/incidents" icon={<AlertTriangle size={18} />} title="Incidentes" />
          <MenuItem to="/services/operators" icon={<Users size={18} />} title="Operadores" />
          <MenuItem to="/services/tools" icon={<Wrench size={18} />} title="Ferramentas" />
          <MenuItem to="/services/operations" icon={<ClipboardList size={18} />} title="Operações" />
        </nav>
      </div>

      <div className="p-6 text-xs text-slate-500 font-mono border-t border-slate-800/50">
        <span>v2.4.0 • Claranet GCC</span>
      </div>
    </aside>
  );
}

function MenuItem({ icon, title, to, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
          isActive
            ? "bg-blue-600/10 text-blue-400 border border-blue-500/20 font-semibold shadow-lg shadow-blue-500/5"
            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent"
        }`
      }
    >
      {icon}
      <span>{title}</span>
    </NavLink>
  );
}