// components/Reports/ImportDropzone.jsx
import { useId, useState } from "react";
import { parseXlsFile } from "../../utils/reportsFiles";
import { ACCENT_BUTTON, ACCENT_DROPZONE_DRAGOVER } from "../../utils/reportsAccent";

// Zona de arrastar-e-largar (ou clicar) pra importar um .xls/.xlsx
// exportado do ServiceNow, parseado 100% no browser (ver
// utils/reportsFiles.js) — nada é enviado ao backend nesta etapa.
export default function ImportDropzone({ onImport, fileName, accent = "blue" }) {
  const inputId = useId();
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleFile(file) {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const rows = await parseXlsFile(file);
      onImport(rows, file.name);
    } catch (err) {
      setError(err.message || "Erro ao ler o ficheiro.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFile(e.dataTransfer.files[0]);
      }}
      className={`rounded-lg p-3 flex flex-col gap-1.5 border border-dashed transition-colors ${
        dragOver
          ? ACCENT_DROPZONE_DRAGOVER[accent]
          : "border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40"
      }`}
    >
      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight text-center">
        Arraste o ficheiro XLS aqui ou clique abaixo
      </p>
      <input
        type="file"
        id={inputId}
        accept=".xls,.xlsx"
        className="hidden"
        onChange={(e) => handleFile(e.target.files[0])}
      />
      <button
        type="button"
        onClick={() => document.getElementById(inputId).click()}
        className={`w-full ${ACCENT_BUTTON[accent]} text-white text-[11px] py-1.5 px-2 rounded font-medium transition-colors`}
      >
        {loading ? "A carregar…" : "Selecionar"}
      </button>
      <div className="text-[10px] mt-0.5 truncate text-center">
        {error ? (
          <span className="text-red-500 dark:text-red-400">{error}</span>
        ) : fileName ? (
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">✓ {fileName}</span>
        ) : (
          <span className="text-slate-400 dark:text-slate-500">Nenhum ficheiro</span>
        )}
      </div>
    </div>
  );
}
