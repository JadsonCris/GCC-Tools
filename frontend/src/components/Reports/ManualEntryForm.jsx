// components/Reports/ManualEntryForm.jsx
// Entrada manual de changes do CAB (quando um change aprovado não
// aparece no export do ServiceNow) — union com o resultado filtrado
// antes de gerar o e-mail, sem passar pelo cruzamento Outage x Changes.
import { useState } from "react";

const inputClass =
  "w-full bg-slate-50 dark:bg-slate-900/60 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-500 transition-colors";

export default function ManualEntryForm({ onAdd }) {
  const [numero, setNumero] = useState("");
  const [ci, setCi] = useState("");
  const [desc, setDesc] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [erro, setErro] = useState("");

  function handleAdicionar() {
    if (!numero.trim()) {
      setErro("O campo Change é obrigatório.");
      return;
    }
    onAdd({
      Number: numero.trim(),
      "Configuration item": ci.trim(),
      "Short description": desc.trim(),
      "Unavailability Start Date": inicio ? inicio.replace("T", " ") : "",
      "Unavailability End Date": fim ? fim.replace("T", " ") : "",
    });
    setNumero("");
    setCi("");
    setDesc("");
    setInicio("");
    setFim("");
    setErro("");
  }

  return (
    <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        Caso um change não apareça nos filtros, adicione-o manualmente para incluir no relatório.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-[11px] font-semibold text-sky-600 dark:text-sky-300 block mb-1">Change</label>
          <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex: CHG0012345" className={inputClass} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-sky-600 dark:text-sky-300 block mb-1">Configuration Item</label>
          <input value={ci} onChange={(e) => setCi(e.target.value)} placeholder="Ex: SGCC-SENV" className={inputClass} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-sky-600 dark:text-sky-300 block mb-1">Short Description</label>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descrição breve do change" className={inputClass} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-semibold text-sky-600 dark:text-sky-300 block mb-1">Unavailability Start Date</label>
          <input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-sky-600 dark:text-sky-300 block mb-1">Unavailability End Date</label>
          <input type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} className={inputClass} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleAdicionar}
          className="bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors"
        >
          + Adicionar Change
        </button>
        {erro && <span className="text-[11px] text-amber-500">{erro}</span>}
      </div>
    </div>
  );
}
