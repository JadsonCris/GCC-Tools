// pages/Reports1.jsx — Report P1 Semanal
// Único import (P1s Semanal, sem filtro de janela — a query do
// ServiceNow já vem restrita a "semana passada") → gera o e-mail via
// Outlook local (backend/services/reports_email_service.py).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ImportSlotCard from "../components/Reports/ImportSlotCard";
import ImportedDataTable from "../components/Reports/ImportedDataTable";
import { getReportsExportConfig, sendP1SemanalReport } from "../service/reportsApi";

export default function ReportP1() {
  const { data: exportConfig } = useQuery({
    queryKey: ["reports-export-config"],
    queryFn: getReportsExportConfig,
  });
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: "success" | "error", message }

  function handleImport(importedRows, name) {
    setRows(importedRows);
    setFileName(name);
    setFeedback(null);
  }

  async function handleEnviar() {
    setSending(true);
    setFeedback(null);
    try {
      const data = await sendP1SemanalReport(rows);
      setFeedback({ type: "success", message: data.message });
    } catch (err) {
      setFeedback({ type: "error", message: err.response?.data?.detail || err.message });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200 dark:border-slate-800 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Report P1 Semanal</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Download do ficheiro ServiceNow, importação e geração do e-mail.
        </p>
      </div>

      <div>
        <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
          1. Download &amp; Importar Ficheiro
        </h3>
        <div className="max-w-sm">
          <ImportSlotCard
            label={exportConfig?.p1Semanal?.label || "P1s Semanal"}
            downloadUrl={exportConfig?.p1Semanal?.url}
            rows={rows}
            fileName={fileName}
            onImport={handleImport}
            accent="blue"
          />
        </div>
      </div>

      <div>
        <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
          2. Dados Importados
        </h3>
        <div className="bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
          <ImportedDataTable rows={rows} emptyLabel="Importe o ficheiro para ver os dados." />
        </div>
      </div>

      <div>
        <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
          3. Gerar E-mail no Outlook
        </h3>
        <button
          type="button"
          onClick={handleEnviar}
          disabled={sending || !fileName}
          className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2 px-5 rounded-lg text-sm transition-colors"
        >
          {sending ? "A gerar…" : "Enviar Análise P1 Semanal"}
        </button>

        {feedback && (
          <p
            className={`mt-3 text-sm ${
              feedback.type === "success"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {feedback.message}
          </p>
        )}
      </div>
    </div>
  );
}
