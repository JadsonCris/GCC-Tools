// pages/SplunkValidacao.jsx
// Cruza um export de tickets EdpOn com um export do Splunk ITSI — motor
// 100% client-side (sem backend), portado verbatim de utils/splunkValidation.js.
// Duas vistas: "main" (grelha de 8 categorias) e "analysis" (estatísticas +
// tabela pesquisável/ordenável), tal como no original.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CATEGORY_COLORS,
  CATEGORY_ORDER,
  buildAnalysisData,
  buildComparisonCategories,
  calculateTotalTickets,
  extractMapData,
  extractSplunkData,
  formatNocTimestamp,
  processFile,
  translateSplunkSev,
} from "../utils/splunkValidation";
import { getReportsExportConfig } from "../service/reportsApi";

const CARD_STYLE = {
  Resolvido: { top: "var(--sv-edp-green)" },
  Fechado: { top: "var(--sv-edp-green-hover)" },
  Cancelado: { top: "var(--sv-status-red)" },
  "Em Espera": { top: "var(--sv-status-orange)" },
  Novo: { top: "var(--sv-snow-blue)" },
  Atribuído: { top: "#ca8a04" },
  "Em Curso": { top: "var(--sv-edp-purple)" },
  "Não Encontrado": { top: "var(--sv-border)" },
};

function itemVisualClass(item) {
  if (item.isDynatrace) return "text-white";
  if (item.isMismatch) return "";
  if (item.isWarning) return "";
  if (item.isMatch && item.source === "edpon") return "";
  return "";
}

function itemColor(item) {
  if (item.isDynatrace) return "#fff";
  if (item.isMismatch) return "var(--sv-status-red)";
  if (item.isWarning) return "var(--sv-status-orange)";
  if (item.isMatch && item.source === "edpon") return "var(--sv-edp-green)";
  return "var(--sv-text-muted)";
}

function ticketHref(item) {
  if (item.source !== "edpon") return null;
  if (item.rawNum.startsWith("OUT")) {
    return `https://edpon.service-now.com/nav_to.do?uri=%2Ftextsearch.do%3Fsysparm_search%3D${item.rawNum}`;
  }
  return `https://edpon.service-now.com/incident.do?sysparm_query=number=${item.rawNum}`;
}

function DropZone({ label, hint, fileName, counter, accept, onFile }) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      className={`rounded-lg p-4 flex flex-col items-center justify-center gap-1 text-center cursor-pointer border border-dashed transition-colors min-h-[110px] ${
        dragOver ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10" : "border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40"
      }`}
    >
      <span className="text-xl">{label}</span>
      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Arraste ou clique</span>
      <span className="text-[10px] text-slate-400">{hint}</span>
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]); }}
      />
      {fileName && <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium mt-1">✔ Carregado: {fileName}</div>}
      {counter > 0 && <div className="text-[10px] text-emerald-600 dark:text-emerald-400">✔ {counter} Tickets no Total</div>}
    </label>
  );
}

export default function SplunkValidacao() {
  const { data: exportConfig } = useQuery({
    queryKey: ["reports-export-config"],
    queryFn: getReportsExportConfig,
  });

  const [edponText, setEdponText] = useState("");
  const [splunkText, setSplunkText] = useState("");
  const [edponFileName, setEdponFileName] = useState("");
  const [splunkFileName, setSplunkFileName] = useState("");
  const [view, setView] = useState("main");
  const [lastValidatedAt, setLastValidatedAt] = useState(null);
  const [categories, setCategories] = useState(null);
  const [showNormalClosed, setShowNormalClosed] = useState(true);

  // Vista de análise
  const [analysisData, setAnalysisData] = useState(null);
  const [stateFilter, setStateFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortColumn, setSortColumn] = useState("");
  const [sortAsc, setSortAsc] = useState(true);

  async function handleFile(file, isSplunk) {
    try {
      const text = await processFile(file, isSplunk);
      if (isSplunk) {
        setSplunkText(text);
        setSplunkFileName(file.name);
      } else {
        setEdponText(text);
        setEdponFileName(file.name);
      }
    } catch (err) {
      alert(err.message || `Erro ao ler ficheiro: ${file.name}`);
    }
  }

  function handleValidar() {
    if (!edponText.trim() && !splunkText.trim()) {
      alert("Por favor, carregue os ficheiros primeiro antes da validação.");
      return;
    }
    if (!splunkText.trim()) {
      alert("Por favor, forneça dados do Splunk para prosseguir.");
      return;
    }
    setLastValidatedAt(new Date());
    const edponMap = extractMapData(edponText);
    const splunkMap = extractSplunkData(splunkText);
    setCategories(buildComparisonCategories(edponMap, splunkMap));
  }

  function handleAnalisar() {
    if (!edponText.trim()) {
      alert("Nenhuns dados carregados para EdpOn.");
      return;
    }
    setAnalysisData(buildAnalysisData(edponText, splunkText));
    setStateFilter("");
    setSearchQuery("");
    setSortColumn("");
    setView("analysis");
  }

  const analysisRows = useMemo(() => {
    if (!analysisData) return [];
    let rows = analysisData.items;
    if (stateFilter) rows = rows.filter((r) => r.state === stateFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.ticket.toLowerCase().includes(q) ||
          r.type.toLowerCase().includes(q) ||
          r.state.toLowerCase().includes(q) ||
          r.priority.toLowerCase().includes(q) ||
          r.severity.toLowerCase().includes(q) ||
          r.raw.toLowerCase().includes(q)
      );
    }
    if (sortColumn) {
      rows = [...rows].sort((a, b) => {
        const valA = String(a[sortColumn]).toUpperCase();
        const valB = String(b[sortColumn]).toUpperCase();
        if (valA < valB) return sortAsc ? -1 : 1;
        if (valA > valB) return sortAsc ? 1 : -1;
        return 0;
      });
    }
    return rows;
  }, [analysisData, stateFilter, searchQuery, sortColumn, sortAsc]);

  function toggleSort(col) {
    if (sortColumn === col) setSortAsc((a) => !a);
    else {
      setSortColumn(col);
      setSortAsc(true);
    }
  }

  const totalRecords = analysisData?.items.length || 1;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="p-2.5 bg-purple-500/10 text-purple-500 dark:text-purple-400 rounded-xl border border-purple-500/20 text-lg">
          🕵️
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Validação Splunk — EdpOn</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Cruza tickets do EdpOn com o Splunk ITSI e assinala prioridades desalinhadas.
          </p>
        </div>
      </div>

      {view === "main" && (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5">
              <strong className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Validação Executada</strong>
              <span className="text-sm font-bold text-slate-500 dark:text-slate-400">
                {lastValidatedAt ? formatNocTimestamp(lastValidatedAt) : "A aguardar execução..."}
              </span>
            </div>
            <button
              type="button"
              onClick={handleValidar}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors flex items-center gap-1.5"
            >
              ✔ Validar Tickets
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-3 p-4 bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 rounded-md">
                    EdpOn
                  </span>
                  <h4 className="font-bold text-sm text-slate-800 dark:text-white mt-1.5">Ficheiro EdpOn</h4>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {exportConfig?.splunkValidacao?.edpon?.url && (
                    <button
                      type="button"
                      onClick={() => window.open(exportConfig.splunkValidacao.edpon.url, "_blank")}
                      className="text-[11px] font-semibold px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white transition-colors"
                    >
                      Transferir
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleAnalisar}
                    className="text-[11px] font-semibold px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white transition-colors"
                  >
                    Analisar
                  </button>
                </div>
              </div>
              <DropZone
                label="⚡"
                hint=".csv, .xls, .xlsx"
                fileName={edponFileName}
                counter={calculateTotalTickets(edponText)}
                accept=".csv,.xls,.xlsx"
                onFile={(f) => handleFile(f, false)}
              />
            </div>

            <div className="flex flex-col gap-3 p-4 bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-xs font-semibold px-2 py-0.5 bg-violet-500/10 text-violet-600 dark:text-violet-300 rounded-md">
                    Splunk
                  </span>
                  <h4 className="font-bold text-sm text-slate-800 dark:text-white mt-1.5">Ficheiro Splunk</h4>
                </div>
                {exportConfig?.splunkValidacao?.splunk?.url && (
                  <button
                    type="button"
                    onClick={() => window.open(exportConfig.splunkValidacao.splunk.url, "_blank")}
                    className="text-[11px] font-semibold px-2 py-1 rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-300 hover:bg-violet-600 hover:text-white transition-colors shrink-0"
                  >
                    Transferir
                  </button>
                )}
              </div>
              <DropZone
                label="🕵️"
                hint="apenas .csv"
                fileName={splunkFileName}
                counter={calculateTotalTickets(splunkText)}
                accept=".csv"
                onFile={(f) => handleFile(f, true)}
              />
            </div>
          </div>

          {categories && (
            <>
              <div className="flex flex-wrap items-center justify-center gap-3 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Legenda:</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                  Ticket EdpOn
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: "var(--sv-edp-purple)" }}>
                  Ticket Dynatrace
                </span>
                <button
                  type="button"
                  onClick={() => setShowNormalClosed((v) => !v)}
                  className={`text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors ${
                    showNormalClosed ? "bg-emerald-600 hover:bg-emerald-500" : "bg-slate-600 hover:bg-slate-500"
                  }`}
                >
                  Mostrar Normal/Closed: {showNormalClosed ? "ON" : "OFF"}
                </button>
              </div>

              <div className="overflow-x-auto">
                <div className="flex gap-3 min-w-max pb-2">
                  {CATEGORY_ORDER.map((cat) => {
                    const allItems = categories[cat] || [];
                    const items = allItems.filter((it) => showNormalClosed || !it.isNormalClosed);
                    return (
                      <div
                        key={cat}
                        className="w-[220px] shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3"
                        style={{ borderTop: `3px solid ${CARD_STYLE[cat]?.top || "var(--sv-border)"}` }}
                      >
                        <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-2 pb-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                          {cat} <span className="text-xs font-normal text-slate-400">{items.length}</span>
                        </h3>
                        <div className="flex justify-between text-[10px] text-slate-400 mb-1 px-1">
                          <span>TICKET</span>
                          <span className="flex gap-2">
                            <span>PRIO</span>
                            <span>SEV</span>
                          </span>
                        </div>
                        <ul className="space-y-1 max-h-[280px] overflow-y-auto">
                          {items.map((item, i) => (
                            <li
                              key={`${item.textId}-${i}`}
                              title={item.source === "edpon" ? (item.isDynatrace ? "EdpOn (Dynatrace)" : "EdpOn") : ""}
                              className="flex items-center justify-between gap-2 text-[11px] rounded-md px-2 py-1.5"
                              style={{
                                background: item.isDynatrace ? "var(--sv-edp-purple)" : "var(--sv-input-bg)",
                                borderLeft: `3px solid ${itemColor(item)}`,
                              }}
                            >
                              {ticketHref(item) ? (
                                <a
                                  href={ticketHref(item)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={`truncate hover:underline ${itemVisualClass(item)}`}
                                  style={{ color: itemColor(item) }}
                                >
                                  {item.textId}
                                </a>
                              ) : (
                                <span className="truncate" style={{ color: itemColor(item) }}>
                                  {item.textId}
                                </span>
                              )}
                              <span className="flex gap-1 shrink-0">
                                <span
                                  title="Prio EdpOn"
                                  className="text-[10px] px-1.5 py-0.5 rounded border"
                                  style={{ borderColor: "var(--sv-border)", color: "var(--sv-text-muted)" }}
                                >
                                  {item.snowPrio || "-"}
                                </span>
                                <span
                                  title={item.wasClosed && translateSplunkSev(item.splunkSev) !== "C" ? "Sev Splunk (Anterior)" : "Sev Splunk"}
                                  className="text-[10px] px-1.5 py-0.5 rounded border"
                                  style={{ borderColor: "var(--sv-border)", color: "var(--sv-text-muted)" }}
                                >
                                  {translateSplunkSev(item.splunkSev)}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {view === "analysis" && analysisData && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Motor de Análise EdpOn</h2>
            <button
              type="button"
              onClick={() => setView("main")}
              className="bg-slate-600 hover:bg-slate-500 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors"
            >
              ← Voltar ao Dashboard
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: "Total de Registos", value: analysisData.items.length, color: "var(--sv-edp-green)" },
              { label: "Incidentes (INC)", value: analysisData.counts.inc, color: "var(--sv-snow-blue)" },
              { label: "Alterações (CHG)", value: analysisData.counts.chg, color: "var(--sv-edp-green)" },
              { label: "Pedidos (RITM)", value: analysisData.counts.ritm, color: "var(--sv-status-orange)" },
              { label: "Indisponibilidades (OUT)", value: analysisData.counts.out, color: "var(--sv-status-red)" },
            ].map((c) => (
              <div
                key={c.label}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3"
                style={{ borderLeft: `3px solid ${c.color}` }}
              >
                <h4 className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">{c.label}</h4>
                <div className="text-xl font-bold" style={{ color: c.color }}>
                  {c.value}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">
              Distribuição Normalizada de Estados{" "}
              <span className="text-[11px] font-normal text-slate-400 ml-2">(Clique para filtrar)</span>
            </h4>
            <div className="space-y-2">
              {Object.entries(analysisData.stateCounts).map(([state, count]) => {
                const percent = ((count / totalRecords) * 100).toFixed(1);
                return (
                  <button
                    type="button"
                    key={state}
                    onClick={() => setStateFilter((f) => (f === state ? "" : state))}
                    className={`w-full text-left rounded-md p-1.5 transition-colors ${
                      stateFilter === state ? "bg-slate-100 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    }`}
                  >
                    <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      <span>{state}</span>
                      <span>
                        {percent}% ({count})
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${percent}%`, backgroundColor: CATEGORY_COLORS[state] || "#94a3b8" }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                A apresentar {analysisRows.length} de {analysisData.items.length} registos
              </span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Pesquisar ticket, estado, linha original..."
                className="field-input-ps max-w-xs"
              />
            </div>
            <div className="overflow-auto max-h-[420px]">
              <table className="text-xs border-collapse w-full">
                <thead>
                  <tr>
                    {[
                      ["ticket", "Ticket"],
                      ["type", "Type"],
                      ["state", "State"],
                      ["priority", "Prio"],
                      ["severity", "Splunk"],
                      ["raw", "Original (Raw)"],
                    ].map(([key, label]) => (
                      <th
                        key={key}
                        onClick={() => toggleSort(key)}
                        className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-left px-2 py-1.5 font-semibold border-b border-slate-200 dark:border-slate-700 cursor-pointer whitespace-nowrap"
                      >
                        {label}
                        {sortColumn === key && (sortAsc ? " ▲" : " ▼")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {analysisRows.map((row, i) => {
                    const typeColor =
                      row.type === "Incidente"
                        ? "var(--sv-snow-blue)"
                        : row.type === "Alteração"
                        ? "var(--sv-edp-green)"
                        : row.type === "Pedido"
                        ? "var(--sv-status-orange)"
                        : "var(--sv-status-red)";
                    return (
                      <tr key={`${row.ticket}-${i}`} className={i % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-slate-50 dark:bg-slate-900/60"}>
                        <td className="px-2 py-1 font-semibold">{row.ticket}</td>
                        <td className="px-2 py-1 font-semibold" style={{ color: typeColor }}>
                          {row.type}
                        </td>
                        <td className="px-2 py-1">{row.state}</td>
                        <td className="px-2 py-1">
                          <span className="text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: "var(--sv-border)" }}>
                            {row.priority}
                          </span>
                        </td>
                        <td className="px-2 py-1">
                          <span className="text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: "var(--sv-border)" }}>
                            {translateSplunkSev(row.severity)}
                          </span>
                        </td>
                        <td className="px-2 py-1 text-[11px] text-slate-400 truncate max-w-xs" title={row.raw}>
                          {row.raw}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
