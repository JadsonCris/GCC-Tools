import { Link } from "react-router-dom";
import ThemeToggle from "../ThemeToggle.jsx";

export default function Header() {
  const d = new Date();

  const dia = d.getDate().toString().padStart(2, '0');
  const mes = d.toLocaleDateString("pt-BR", { month: "long" });
  const ano = d.getFullYear();

  const dataFormatada = `${dia} ${mes} ${ano}`;

  return (
    <header className="h-24 border-b border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 flex items-center justify-between px-8 z-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">
          Service Dashboard
        </h1>
        <p className="text-xs text-slate-400 dark:text-slate-500 capitalize">
          {dataFormatada}
        </p>
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
  );
}
