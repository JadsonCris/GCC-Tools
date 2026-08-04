// pages/Turnos.jsx
// Gestão de Turnos MOD — porta da ferramenta HTML/localStorage
// original pra dentro da app: os mesmos dados (importados uma vez de
// backend/data/turnos_seed.json), mas agora editados aqui e gravados
// na dashboard.db (ver backend/services/turnos_service.py).
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getEmployees, getShiftsForYear } from "../service/turnosApi";
import EscalaTab from "../components/Turnos/EscalaTab";
import EstatisticasTab from "../components/Turnos/EstatisticasTab";
import MetricasIndividuaisTab from "../components/Turnos/MetricasIndividuaisTab";
import { MONTHS } from "../utils/turnosCalc";

const TABS = [
  { key: "escala", label: "Escala" },
  { key: "stats-mensal", label: "Estatísticas Mensais" },
  { key: "stats-anual", label: "Estatísticas Anuais" },
  { key: "individual", label: "Métricas Individuais" },
];

const YEAR_MIN = 2026;
const YEAR_MAX = 2030;
const ALL_MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function Turnos() {
  const [tab, setTab] = useState("escala");
  const now = new Date();
  const [year, setYear] = useState(Math.min(Math.max(now.getFullYear(), YEAR_MIN), YEAR_MAX));
  const [month, setMonth] = useState(now.getMonth() + 1);
  // A Escala perde o rascunho não guardado quando muda de mês/ano (ver
  // EscalaTab.jsx — remonta com `key`). Confirma antes de sair da
  // Escala com alterações por guardar, pra não perder trabalho.
  const [escalaDirty, setEscalaDirty] = useState(false);
  const confirmLeaveEscala = () =>
    tab !== "escala" || !escalaDirty || confirm("Tens alterações da Escala por guardar. Sair sem guardar?");

  const queryClient = useQueryClient();

  const { data: employees = [], isLoading: loadingEmployees } = useQuery({
    queryKey: ["turnos-employees"],
    queryFn: getEmployees,
  });

  const { data: yearShifts = {}, isLoading: loadingShifts } = useQuery({
    queryKey: ["turnos-shifts", year],
    queryFn: () => getShiftsForYear(year),
  });

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["turnos-employees"] });
    queryClient.invalidateQueries({ queryKey: ["turnos-shifts", year] });
  };

  const loading = loadingEmployees || loadingShifts;
  const selectClass = "px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-sm";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Gestão de Turnos</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Escala da equipa MOD, estatísticas mensais/anuais e métricas individuais.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={(e) => { if (confirmLeaveEscala()) setMonth(Number(e.target.value)); }}
            className={selectClass}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => { if (confirmLeaveEscala()) setYear(Number(e.target.value)); }}
            className={selectClass}
          >
            {Array.from({ length: YEAR_MAX - YEAR_MIN + 1 }, (_, i) => YEAR_MIN + i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-1 flex-wrap border-b border-slate-200 dark:border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => { if (confirmLeaveEscala()) setTab(t.key); }}
            className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-colors ${
              tab === t.key
                ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-white border border-b-0 border-slate-200 dark:border-slate-800"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-b-xl rounded-tr-xl p-5 -mt-6 pt-8">
        {loading && <p className="text-slate-500 text-sm">A carregar...</p>}

        {!loading && tab === "escala" && (
          <EscalaTab
            key={`${year}-${month}`}
            employees={employees}
            yearShifts={yearShifts}
            year={year}
            month={month}
            onSaved={refreshAll}
            onDirtyChange={setEscalaDirty}
          />
        )}
        {!loading && tab === "stats-mensal" && (
          <EstatisticasTab
            employees={employees}
            yearShifts={yearShifts}
            year={year}
            months={[month]}
            title={`${MONTHS[month - 1]} ${year}`}
            isAnnual={false}
          />
        )}
        {!loading && tab === "stats-anual" && (
          <EstatisticasTab
            employees={employees}
            yearShifts={yearShifts}
            year={year}
            months={ALL_MONTHS}
            title={`Ano ${year}`}
            isAnnual={true}
          />
        )}
        {!loading && tab === "individual" && (
          <MetricasIndividuaisTab employees={employees} yearShifts={yearShifts} year={year} />
        )}
      </div>
    </div>
  );
}
