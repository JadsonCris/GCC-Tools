// components/Reports/ImportSlotCard.jsx
import ImportDropzone from "./ImportDropzone";
import { ACCENT_BUTTON, ACCENT_CARD_HOVER } from "../../utils/reportsAccent";

// Card de um "slot" de import: título, botão de download (abre a URL do
// ServiceNow numa nova aba — sessão do próprio utilizador) + dropzone +
// badge com a contagem de linhas importadas. `accent` tinge o botão de
// download e o hover do card — usado pra diferenciar visualmente a
// região (Ibéria=blue/Brasil=emerald no Report matinal) ou o tipo de
// slot (Outage=red no CAB).
export default function ImportSlotCard({ label, downloadUrl, rows, fileName, onImport, accent = "blue" }) {
  const imported = Boolean(fileName);

  return (
    <div
      className={`flex flex-col p-4 bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl transition-all group space-y-3 ${ACCENT_CARD_HOVER[accent]}`}
    >
      <div>
        <h4 className="font-bold text-sm text-slate-800 dark:text-white flex items-center gap-1.5">
          {label}
          {imported && (
            <span title="Ficheiro carregado" className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          )}
        </h4>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          {rows.length} linha{rows.length === 1 ? "" : "s"} importada{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      {downloadUrl && (
        <button
          type="button"
          onClick={() => window.open(downloadUrl, "_blank")}
          className={`w-full ${ACCENT_BUTTON[accent]} text-white font-medium py-2 px-3 rounded-lg text-xs transition-colors`}
        >
          ↓ Descarregar
        </button>
      )}

      <ImportDropzone fileName={fileName} onImport={onImport} accent={accent} />
    </div>
  );
}
