// pages/ReportPt.jsx — Report Ibéria / Brasil (conf call matinal)
// Duas abas (uma por região), cada uma com 4 slots de import, filtro de
// janela (Diário = 1 dia atrás, Segunda/FDS = 3 dias atrás) e o fluxo de
// "Report Feriado" (janela com nº de dias customizado) → gera o e-mail
// via Outlook local, uma secção por slot.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ImportSlotCard from "../components/Reports/ImportSlotCard";
import ImportedDataTable from "../components/Reports/ImportedDataTable";
import { computeBackwardWindow, filterAndSortRowsByWindow, fmtDtPt } from "../utils/reportsDate";
import { REGIONS, SLOTS, SLOT_LABELS, sectionTitles } from "../utils/reportsRegionConfig";
import { ACCENT_BADGE, ACCENT_BUTTON, ACCENT_TAB_ACTIVE, ACCENT_TAB_HOVER, ACCENT_TEXT } from "../utils/reportsAccent";
import { getReportsExportConfig, sendOutlookReport } from "../service/reportsApi";

const sectionLabelClass = "text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3";

function emptySlots() {
  return { p1Matinal: { rows: [], fileName: "" }, incsDiario: { rows: [], fileName: "" }, backups: { rows: [], fileName: "" }, batchs: { rows: [], fileName: "" } };
}

export default function ReportPt() {
  const { data: exportConfig } = useQuery({
    queryKey: ["reports-export-config"],
    queryFn: getReportsExportConfig,
  });

  const [tab, setTab] = useState("ib");
  const [data, setData] = useState({ ib: emptySlots(), br: emptySlots() });
  const [windowByRegion, setWindowByRegion] = useState({ ib: null, br: null });
  const [feriadoDias, setFeriadoDias] = useState({ ib: "", br: "" });
  const [feriadoUnlocked, setFeriadoUnlocked] = useState({ ib: false, br: false });
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState({ ib: null, br: null });

  function updateSlot(region, slot, rows, fileName) {
    setData((prev) => ({ ...prev, [region]: { ...prev[region], [slot]: { rows, fileName } } }));
  }

  function applyWindow(region, daysBack) {
    const { startHour, endHour } = REGIONS[region];
    const janela = computeBackwardWindow(new Date(), { startHour, endHour, daysBack });
    setWindowByRegion((prev) => ({ ...prev, [region]: janela }));
    return janela;
  }

  function obterDiasFeriado(region) {
    const dias = parseInt(feriadoDias[region], 10);
    if (!feriadoDias[region].trim() || isNaN(dias) || dias < 1) {
      setFeedback((prev) => ({ ...prev, [region]: { type: "error", message: "Indique a quantidade de dias (ex: 4 para um feriado prolongado)." } }));
      return null;
    }
    return dias;
  }

  function handleFiltrarFeriado(region) {
    const dias = obterDiasFeriado(region);
    if (!dias) return;
    applyWindow(region, dias);
    setFeriadoUnlocked((prev) => ({ ...prev, [region]: false }));
    setFeedback((prev) => ({ ...prev, [region]: null }));
  }

  async function handleEnviar(region, tipoReport, diasFeriado = null) {
    setSending(true);
    setFeedback((prev) => ({ ...prev, [region]: null }));

    const diasRetroativos = diasFeriado != null ? diasFeriado : tipoReport === "FDS" ? 3 : 1;
    const janela = applyWindow(region, diasRetroativos);

    const titles = sectionTitles(region);
    const tabelas = {};
    for (const slot of SLOTS) {
      tabelas[titles[slot]] = filterAndSortRowsByWindow(data[region][slot].rows, janela);
    }

    try {
      const resp = await sendOutlookReport({ regiao: region, tipo: tipoReport, tabelas });
      setFeedback((prev) => ({ ...prev, [region]: { type: "success", message: resp.message } }));
    } catch (err) {
      setFeedback((prev) => ({ ...prev, [region]: { type: "error", message: err.response?.data?.detail || err.message } }));
    } finally {
      setSending(false);
    }
  }

  async function handleEnviarFeriado(region) {
    const dias = obterDiasFeriado(region);
    if (!dias) return;
    await handleEnviar(region, "DIARIO", dias);
    setFeriadoUnlocked((prev) => ({ ...prev, [region]: false }));
  }

  const region = REGIONS[tab];
  const slots = data[tab];
  const windowInfo = windowByRegion[tab];
  const fb = feedback[tab];
  const regionExport = exportConfig?.regions?.[tab];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Report Ibéria / Brasil</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {tab === "ib"
            ? `Ibéria – Janela ${region.startHour}h (D-1) – 0${region.endHour}h`
            : `South America (Brasil) – Janela ${region.startHour}h (D-1) – ${region.endHour}h`}
        </p>
      </div>

      <div className="flex gap-1 flex-wrap border-b border-slate-200 dark:border-slate-800">
        {Object.entries(REGIONS).map(([key, cfg]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg transition-colors ${
              tab === key ? ACCENT_TAB_ACTIVE[cfg.accent] : `text-slate-500 dark:text-slate-400 ${ACCENT_TAB_HOVER[cfg.accent]}`
            }`}
          >
            Report {cfg.label}
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-b-xl rounded-tr-xl p-6 -mt-6 pt-8 space-y-6">
        <div>
          <h3 className={sectionLabelClass}>1. Downloads</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {SLOTS.map((slot) => (
              <ImportSlotCard
                key={slot}
                label={regionExport?.[slot]?.label || SLOT_LABELS[slot]}
                downloadUrl={regionExport?.[slot]?.url}
                rows={slots[slot].rows}
                fileName={slots[slot].fileName}
                accent={region.accent}
                onImport={(rows, name) => updateSlot(tab, slot, rows, name)}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">2. Dados Importados</h3>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Janela:{" "}
                <span className={`font-mono ${ACCENT_TEXT[region.accent]}`}>
                  {windowInfo ? `${fmtDtPt(windowInfo.start)} – ${fmtDtPt(windowInfo.end)}` : "—"}
                </span>
              </span>
              <button
                type="button"
                onClick={() => applyWindow(tab, 1)}
                className={`${ACCENT_BUTTON[region.accent]} text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors`}
              >
                ⏱ Diário 3F-&gt;6F
              </button>
              <button
                type="button"
                onClick={() => applyWindow(tab, 3)}
                className={`${ACCENT_BUTTON[region.accent]} text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors`}
              >
                ⏱ Segunda
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {SLOTS.map((slot) => (
              <div key={slot} className="bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{regionExport?.[slot]?.label || SLOT_LABELS[slot]}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ACCENT_BADGE[region.accent]}`}>
                    {filterAndSortRowsByWindow(slots[slot].rows, windowInfo).length} linhas
                  </span>
                </div>
                <ImportedDataTable
                  rows={filterAndSortRowsByWindow(slots[slot].rows, windowInfo)}
                  rowClassName={() => (windowInfo ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-white dark:bg-slate-900")}
                  emptyLabel="Importe o ficheiro para ver os dados."
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className={sectionLabelClass}>Report Feriado {region.label}</h3>
          <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Filtra e gera o report para um feriado prolongado: indique quantos dias retroagir a partir de agora
              (ex: 4 para um feriado de 4 dias), mantendo sempre o horário {region.startHour}h – 0{region.endHour}h.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={`text-[11px] font-semibold block mb-1 ${ACCENT_TEXT[region.accent]}`}>Quantidade de Dias (retroativos)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={feriadoDias[tab]}
                  onChange={(e) => setFeriadoDias((prev) => ({ ...prev, [tab]: e.target.value }))}
                  disabled={!feriadoUnlocked[tab]}
                  placeholder="Ex: 4"
                  className="w-full bg-slate-100 dark:bg-slate-900/60 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => setFeriadoUnlocked((prev) => ({ ...prev, [tab]: !prev[tab] }))}
                  className="w-full bg-slate-500 hover:bg-slate-400 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
                >
                  {feriadoUnlocked[tab] ? "🔒 Bloquear" : "🔓 Unlock"}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleFiltrarFeriado(tab)}
                className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
              >
                Filtrar Feriado
              </button>
              <button
                type="button"
                onClick={() => handleEnviarFeriado(tab)}
                disabled={sending}
                className="bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
              >
                Report Feriado {region.label}
              </button>
            </div>
          </div>
        </div>

        <div>
          <h3 className={sectionLabelClass}>4. Gerar E-mail no Outlook</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleEnviar(tab, "DIARIO")}
              disabled={sending}
              className={`${ACCENT_BUTTON[region.accent]} disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-xs transition-colors`}
            >
              {sending ? "A gerar…" : "Report Diário (Semana)"}
            </button>
            <button
              type="button"
              onClick={() => handleEnviar(tab, "FDS")}
              disabled={sending}
              className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-xs transition-colors"
            >
              {sending ? "A gerar…" : "Report Fim de Semana"}
            </button>
          </div>

          {fb && (
            <p className={`mt-3 text-sm ${fb.type === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {fb.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
