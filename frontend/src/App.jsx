import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";

// Layouts Dedicados
import MainLayout from "./layouts/MainLayout.jsx";
import ReportsLayout from "./layouts/ReportsLayout.jsx";

// Páginas — carregadas sob demanda (React.lazy + code-splitting do Vite)
// em vez de tudo no bundle inicial. Antes disto, todas as 12 páginas
// (incluindo os pesados gráficos MUI X Charts de cada uma) entravam no
// mesmo chunk de 837KB carregado logo no primeiro acesso, mesmo que o
// utilizador só visite uma página por sessão — agora cada rota vira o
// seu próprio ficheiro, buscado só quando navegada.
const Home = lazy(() => import("./pages/Home.jsx"));
const DashboardServices = lazy(() => import("./pages/DashboardServices.jsx"));
const SLA = lazy(() => import("./pages/SLA.jsx"));
const CentralOperacional = lazy(() => import("./pages/CentralOperacional.jsx"));
const AIOper = lazy(() => import("./pages/AIOper.jsx"));
const MajorIncs = lazy(() => import("./pages/MajorIncs.jsx"));
const Turnos = lazy(() => import("./pages/Turnos.jsx"));
const AdvancedSla = lazy(() => import("./pages/AdvancedSla.jsx"));
const DashboardReports = lazy(() => import("./pages/DashboardReports.jsx"));
const Report9Manha = lazy(() => import("./pages/ReportPt.jsx"));
const CAB = lazy(() => import("./pages/CAB.jsx"));
const CriticalIncidents = lazy(() => import("./pages/CriticalIncidents.jsx"));
const ReportP1 = lazy(() => import("./pages/Reports1.jsx"));

function RouteFallback() {
  return <div className="p-8 text-center text-sm text-slate-400 dark:text-slate-500">A carregar...</div>;
}

function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* 1. Portal de Entrada - Isolado da Sidebar */}
        <Route path="/" element={<Home />} />

        {/* 2. Ecossistema do Dashboard de SERVIÇOS (Usa o MainLayout) */}
        <Route element={<MainLayout />}>
          <Route path="/services" element={<DashboardServices />} />
          <Route path="/services/sla" element={<SLA />} />
          <Route path="/services/advanced-sla" element={<AdvancedSla />} />
          <Route path="/services/central-operacional" element={<CentralOperacional />} />
          <Route path="/services/aioper" element={<AIOper />} />
          <Route path="/services/major-incs" element={<MajorIncs />} />
          <Route path="/services/turnos" element={<Turnos />} />
        </Route>

        {/* 3. Ecossistema do Dashboard de RELATÓRIOS (Usa o ReportsLayout) */}
        <Route element={<ReportsLayout />}>
          <Route path="/reports" element={<DashboardReports />} />
          <Route path="/reports/report9" element={<Report9Manha />} />
          <Route path="/reports/cab" element={<CAB />} />
          <Route path="/reports/critical" element={<CriticalIncidents />} />
          <Route path="/reports/p1" element={<ReportP1 />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default App;