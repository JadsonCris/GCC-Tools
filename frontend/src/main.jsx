import React, { useMemo } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider as MuiThemeProvider, createTheme } from "@mui/material/styles";
import App from "./App.jsx";
import { ColorModeProvider, useColorMode } from "./context/ThemeContext.jsx";
import "./styles/globals.css";

const queryClient = new QueryClient();
const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

// Tema MUI (Prioridade/Ferramentas, TextFields do filtro de datas etc.)
// segue o mesmo modo claro/escuro escolhido no botão do header — sem
// isto os componentes MUI ficam presos ao modo escuro mesmo em light
// mode, ilegíveis contra fundos claros.
function MuiThemeBridge({ children }) {
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

createRoot(root).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ColorModeProvider>
          <MuiThemeBridge>
            <App />
          </MuiThemeBridge>
        </ColorModeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);
