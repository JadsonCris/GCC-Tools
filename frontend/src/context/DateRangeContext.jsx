// context/DateRangeContext.jsx
import { createContext, useContext, useState } from "react";

const DateRangeContext = createContext(null);

export const GEOGRAPHY_OPTIONS = ["Global", "Ibéria", "Brasil"];

/**
 * Estado partilhado do intervalo de datas + geografia selecionados
 * (DateRangeFilter). Colocado no MainLayout pra que Visão Geral / Report
 * SLAs / AIOPER (todas dentro do mesmo layout) mudem juntas quando o
 * utilizador altera o período/geografia numa delas — em vez de cada
 * página ter o seu próprio filtro independente que reseta ao navegar.
 *
 * `region`: "Global" (todos os incidentes) | "Ibéria" (PT+ES) | "Brasil"
 * — réplica do filtro de geografia que existia no dashboard antigo.
 */
export function DateRangeProvider({ children }) {
  const [range, setRange] = useState(null);
  const [region, setRegion] = useState("Global");
  return (
    <DateRangeContext.Provider value={{ range, setRange, region, setRegion }}>{children}</DateRangeContext.Provider>
  );
}

export function useDateRange() {
  const ctx = useContext(DateRangeContext);
  if (!ctx) throw new Error("useDateRange() precisa de estar dentro de <DateRangeProvider>");
  return ctx;
}
