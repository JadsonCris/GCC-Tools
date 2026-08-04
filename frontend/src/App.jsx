import { Routes, Route } from "react-router-dom";

// Layouts Dedicados
import MainLayout from "./layouts/MainLayout.jsx";
import ReportsLayout from "./layouts/ReportsLayout.jsx";

// Páginas Existentes
import Home from "./pages/Home.jsx";
import DashboardServices from "./pages/DashboardServices.jsx";
import SLA from "./pages/SLA.jsx";
import CentralOperacional from "./pages/CentralOperacional.jsx";
import AIOper from "./pages/AIOper.jsx";
import Turnos from "./pages/Turnos.jsx";

// Novas Páginas Analíticas Adicionadas
import AdvancedSla from "./pages/AdvancedSla.jsx";

import DashboardReports from "./pages/DashboardReports.jsx";
import Report9Manha from "./pages/ReportPt.jsx";
import CAB from "./pages/CAB.jsx";
import CriticalIncidents from "./pages/CriticalIncidents.jsx";
import ReportP1 from "./pages/Reports1.jsx";

function App() {
  return (
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
  );
}

export default App;