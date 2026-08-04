// context/ThemeContext.jsx
import { createContext, useContext, useEffect, useState } from "react";

const ColorModeContext = createContext(null);
const STORAGE_KEY = "gcc-theme";

function getInitialTheme() {
  const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
  return stored === "light" ? "light" : "dark"; // dark = comportamento atual, mantido como default
}

/**
 * Tema claro/escuro partilhado por toda a app — controla a classe "dark"
 * na tag <html> (estratégia `darkMode: "class"` do Tailwind, ver
 * tailwind.config.js), persistida em localStorage. Default é "dark" pra
 * não mudar o visual de quem já usa a app. Nome "ColorMode" (não
 * "Theme") pra não colidir com o ThemeProvider do MUI, que também
 * precisa de saber o modo atual (ver main.jsx) pra pintar os
 * componentes MUI (TextField, ToggleButtonGroup...) no tom certo.
 */
export function ColorModeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return <ColorModeContext.Provider value={{ theme, toggleTheme }}>{children}</ColorModeContext.Provider>;
}

export function useColorMode() {
  const ctx = useContext(ColorModeContext);
  if (!ctx) throw new Error("useColorMode() precisa de estar dentro de <ColorModeProvider>");
  return ctx;
}
