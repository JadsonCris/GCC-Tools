import { Sun, Moon } from "lucide-react";
import { useColorMode } from "../context/ThemeContext.jsx";

// Botão partilhado por MainLayout (Serviços) e ReportsLayout (Reports) —
// ambos escrevem/leem o mesmo ColorModeContext global (ver
// context/ThemeContext.jsx), então alternar aqui afeta o frontend
// inteiro, não só o dashboard em que o utilizador está no momento.
export default function ThemeToggle() {
  const { theme, toggleTheme } = useColorMode();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? "Mudar para modo claro" : "Mudar para modo escuro"}
      className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
      {isDark ? "Claro" : "Escuro"}
    </button>
  );
}
