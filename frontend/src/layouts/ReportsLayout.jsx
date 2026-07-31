import { Outlet } from "react-router-dom";
import Header from "../components/Header/Header.jsx";
import ReportsSidebar from "../components/Sidebar/ReportsSidebar.jsx";

export default function ReportsLayout() {
  return (
    <div className="flex h-screen bg-slate-950 text-white">
      <ReportsSidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
