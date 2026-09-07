import { Outlet } from "react-router-dom";
import Header from "../components/Header/Header.jsx";
import ReportsSidebar from "../components/Sidebar/ReportsSidebar.jsx";

export default function ReportsLayout() {
  return (
    <div className="flex h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans overflow-hidden">
      <ReportsSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8 bg-slate-100 dark:bg-slate-950">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
