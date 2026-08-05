import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.jsx";
import { ColorModeProvider } from "./context/ThemeContext.jsx";
import MuiThemeBridge from "./context/MuiThemeBridge.jsx";
import "./styles/globals.css";

// staleTime alto + sem refetch automático ao focar a janela: o dado do
// servidor só muda a cada ciclo do scheduler (CACHE_REFRESH_MINUTES,
// default 20 min — ver backend/cache.py), então refazer o mesmo pedido
// (que já é pesado: enrich de milhares de linhas em pandas) cada vez que
// o utilizador volta à aba era trabalho redundante certo, não uma
// proteção real contra dado desatualizado.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});
const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

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
