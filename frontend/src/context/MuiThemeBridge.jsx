// context/MuiThemeBridge.jsx
import { useMemo } from "react";
import { ThemeProvider as MuiThemeProvider, createTheme } from "@mui/material/styles";
import { useColorMode } from "./ThemeContext.jsx";

/**
 * Tema MUI (Prioridade/Ferramentas, TextFields do filtro de datas etc.)
 * segue o mesmo modo claro/escuro escolhido no botão do header — sem
 * isto os componentes MUI ficam presos ao modo escuro mesmo em light
 * mode, ilegíveis contra fundos claros.
 */
export default function MuiThemeBridge({ children }) {
  const { theme } = useColorMode();
  const muiTheme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: theme,
          background:
            theme === "dark"
              ? { default: "#020617", paper: "#0f172a" }
              : { default: "#f1f5f9", paper: "#ffffff" },
        },
      }),
    [theme]
  );
  return <MuiThemeProvider theme={muiTheme}>{children}</MuiThemeProvider>;
}
