import { useNavigate } from "react-router-dom";
import { BarChart3, FileText } from "lucide-react";

export default function Home() {
  const navigate = useNavigate();

  return (
    // Removemos min-h-screen, flex centralizado e bg-slate-950 duplo
    <div className="max-w-6xl mx-auto py-6">
      <div className="w-full">
        <h1 className="text-4xl font-bold text-white mb-2">
          Claranet GCC Service Dashboard
        </h1>
        <p className="text-slate-400 mb-10">
          Service Management Platform
        </p>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="bg-slate-900 rounded-2xl p-8 border border-slate-800">
            <BarChart3 size={48} className="text-blue-500 mb-5" />
            <h2 className="text-2xl text-white font-bold">Dashboard Serviços</h2>
            <p className="text-slate-400 mt-2 mb-6">SLA, Incidentes, P1 e Operadores</p>
            <button
              onClick={() => navigate("/services")}
              className="bg-blue-600 hover:bg-blue-700 px-5 py-2 rounded-lg font-medium transition-colors"
            >
              Abrir Dashboard
            </button>
          </div>

          <div className="bg-slate-900 rounded-2xl p-8 border border-slate-800">
            <FileText size={48} className="text-emerald-500 mb-5" />
            <h2 className="text-2xl text-white font-bold">Dashboard Reports</h2>
            <p className="text-slate-400 mt-2 mb-6">Report 9, CAB, P1 e Incidentes Críticos</p>
            <button
              onClick={() => navigate("/reports")}
              className="bg-emerald-600 hover:bg-emerald-700 px-5 py-2 rounded-lg font-medium transition-colors"
            >
              Abrir Reports
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}