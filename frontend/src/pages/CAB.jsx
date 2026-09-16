// pages/CAB.jsx — Report CAB (Change Advisory Board)
// Import Outage + Changes → cruzamento por nº de change (+ entradas
// manuais) numa janela 18h→07h (Diário=+1 dia, Fim de Semana=+3 dias,
// Feriado=nº de dias customizado) → gera o e-mail via Outlook local.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ImportSlotCard from "../components/Reports/ImportSlotCard";
import ImportedDataTable from "../components/Reports/ImportedDataTable";
import ManualEntryForm from "../components/Reports/ManualEntryForm";
import { computeForwardWindow, fmtDtPt, nomeDiaSemanaPt, nomeMesPt } from "../utils/reportsDate";
import { crossReferenceCabOutage, normalizeSelectedChange } from "../utils/reportsCab";
import { getReportsExportConfig, sendCabReport } from "../service/reportsApi";

const sectionLabelClass = "text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3";

export default function CAB() {
  const { data: exportConfig } = useQuery({
    queryKey: ["reports-export-config"],
    queryFn: getReportsExportConfig,
  });

  const [outageRows, setOutageRows] = useState([]);
  const [outageFile, setOutageFile] = useState("");
  const [changesRows, setChangesRows] = useState([]);
  const [changesFile, setChangesFile] = useState("");
  const [manuais, setManuais] = useState([]);
  const [selectedChangeIdx, setSelectedChangeIdx] = useState(new Set());
  const [addedChangeIdx, setAddedChangeIdx] = useState(new Set());
  const [resultado, setResultado] = useState([]);
  const [windowLabel, setWindowLabel] = useState("18h hoje – 07h amanhã");
  const [feriadoDias, setFeriadoDias] = useState("");
  const [feriadoUnlocked, setFeriadoUnlocked] = useState(false);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState(null);

  function applyFilter(isFDS, diasCustom = null) {
    if (!outageFile || !changesFile) {
      setFeedback({ type: "error", message: "Importe ambos os ficheiros (Outage e Changes) antes de aplicar o filtro." });
      return;
    }
    const dias = diasCustom != null ? diasCustom : isFDS ? 3 : 1;
    const janela = computeForwardWindow(new Date(), { daysForward: dias });
    const { resultado: res } = crossReferenceCabOutage(outageRows, changesRows, janela);
    setResultado(res);
    setWindowLabel(`${fmtDtPt(janela.start)} – ${fmtDtPt(janela.end)}`);
    setFeedback(null);
  }

  function obterDiasFeriado() {
    const dias = parseInt(feriadoDias, 10);
    if (!feriadoDias.trim() || isNaN(dias) || dias < 1) {
      setFeedback({ type: "error", message: "Indique a quantidade de dias (ex: 4 para um feriado prolongado)." });
      return null;
    }
    return dias;
  }

  function handleFiltrarFeriado() {
    const dias = obterDiasFeriado();
    if (!dias) return;
    applyFilter(false, dias);
    setFeriadoUnlocked(false);
  }

  async function handleEnviar(tipo, diasCustom = null) {
    if (!outageFile || !changesFile) {
      setFeedback({ type: "error", message: "Importe ambos os ficheiros antes de gerar o relatório." });
      return;
    }
    setSending(true);
    setFeedback(null);

    const isFDS = tipo === "FDS";
    const dias = diasCustom != null ? diasCustom : isFDS ? 3 : 1;
    const janela = computeForwardWindow(new Date(), { daysForward: dias });
    const { resultado: resultadoFiltro } = crossReferenceCabOutage(outageRows, changesRows, janela);
    const changes = [...resultadoFiltro, ...manuais];

    const textoInicio = `${nomeDiaSemanaPt(janela.start)}, ${janela.start.getDate()} de ${nomeMesPt(janela.start.getMonth())}`;
    const textoFim = `${nomeDiaSemanaPt(janela.end)}, ${janela.end.getDate()} de ${nomeMesPt(janela.end.getMonth())} de ${janela.end.getFullYear()}`;

    try {
      const data = await sendCabReport({ tipo, texto_inicio: textoInicio, texto_fim: textoFim, changes });
      setFeedback({ type: "success", message: data.message });
    } catch (err) {
      setFeedback({ type: "error", message: err.response?.data?.detail || err.message });
    } finally {
      setSending(false);
    }
  }

  async function handleEnviarFeriado() {
    const dias = obterDiasFeriado();
    if (!dias) return;
    await handleEnviar("DIARIO", dias);
    setFeriadoUnlocked(false);
  }

  function handleToggleChangeRow(i) {
    setSelectedChangeIdx((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function handleToggleAllChanges(checked) {
    if (!checked) {
      setSelectedChangeIdx(new Set());
      return;
    }
    setSelectedChangeIdx(new Set(changesRows.map((_, i) => i).filter((i) => !addedChangeIdx.has(i))));
  }

  // Junta os changes marcados na tabela bruta à mesma lista dos changes
  // manuais (dedupe por Number) — mesma lógica de
  // adicionarChangesSelecionadosCAB() no original.
  // RESOLVIDO (bug real): o dedupe só olhava pra `manuais`, não pra
  // `resultado` (os changes já cruzados automaticamente com o Outage) —
  // marcar a checkbox de um change que já vinha automaticamente no
  // relatório duplicava-o no e-mail final (handleEnviar junta
  // [...resultadoFiltro, ...manuais]).
  function handleAdicionarChangesSelecionados() {
    if (selectedChangeIdx.size === 0) return;
    const numerosExistentes = new Set(
      [...manuais, ...resultado].map((r) => String(r["Number"] || "").trim().toLowerCase()).filter(Boolean)
    );
    const novosManuais = [...manuais];
    const novosAdicionados = new Set(addedChangeIdx);

    for (const idx of selectedChangeIdx) {
      const row = changesRows[idx];
      if (!row) continue;
      const normalizado = normalizeSelectedChange(row);
      const numero = String(normalizado["Number"] || "").trim().toLowerCase();
      if (!numero || !numerosExistentes.has(numero)) {
        novosManuais.push(normalizado);
        if (numero) numerosExistentes.add(numero);
      }
      novosAdicionados.add(idx);
    }

    setManuais(novosManuais);
    setAddedChangeIdx(novosAdicionados);
    setSelectedChangeIdx(new Set());
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-200 dark:border-slate-800 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">CAB – Change Advisory Board</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Janela diária: 18h – 07h do dia seguinte</p>
      </div>

      <div>
        <h3 className={sectionLabelClass}>1. Downloads &amp; Importar Ficheiros</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ImportSlotCard
            label={exportConfig?.cab?.outage?.label || "Outage Diária"}
            downloadUrl={exportConfig?.cab?.outage?.url}
            rows={outageRows}
            fileName={outageFile}
            accent="red"
            onImport={(rows, name) => { setOutageRows(rows); setOutageFile(name); }}
          />
          <ImportSlotCard
            label={exportConfig?.cab?.changes?.label || "Changes Diários"}
            downloadUrl={exportConfig?.cab?.changes?.url}
            rows={changesRows}
            fileName={changesFile}
            accent="blue"
            onImport={(rows, name) => {
              setChangesRows(rows);
              setChangesFile(name);
              // Novo ficheiro: os índices mudam, a seleção anterior deixa de fazer sentido.
              setSelectedChangeIdx(new Set());
              setAddedChangeIdx(new Set());
            }}
          />
        </div>
      </div>

      <div>
        <h3 className={sectionLabelClass}>2. Adicionar Change Manualmente</h3>
        <ManualEntryForm onAdd={(registo) => setManuais((prev) => [...prev, registo])} />
        {manuais.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">Changes adicionados manualmente</span>
              <span className="badge-count text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                {manuais.length}
              </span>
            </div>
            <ImportedDataTable
              rows={manuais}
              onRemoveRow={(i) => setManuais((prev) => prev.filter((_, idx) => idx !== i))}
            />
          </div>
        )}
      </div>

      <div>
        <h3 className={sectionLabelClass}>3. Dados Importados</h3>
        <div className="space-y-4">
          <div className="bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
            <p className="text-xs font-bold text-orange-600 dark:text-orange-300 mb-2">Outage Diária – todos os registos</p>
            <ImportedDataTable rows={outageRows} emptyLabel="Importe o ficheiro de Outage para ver os dados." />
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <p className="text-xs font-bold text-sky-600 dark:text-sky-300">Changes Diários – todos os registos</p>
              <button
                type="button"
                onClick={handleAdicionarChangesSelecionados}
                disabled={selectedChangeIdx.size === 0}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors"
              >
                + Adicionar ao Relatório ({selectedChangeIdx.size})
              </button>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-2">
              Marque a caixa junto de um change para o incluir no relatório mesmo que não caia dentro da janela ou não
              tenha outage associado — aparece junto com os changes adicionados manualmente.
            </p>
            <ImportedDataTable
              rows={changesRows}
              emptyLabel="Importe o ficheiro de Changes para ver os dados."
              selectable
              selectedIndices={selectedChangeIdx}
              disabledIndices={addedChangeIdx}
              onToggleRow={handleToggleChangeRow}
              onToggleAll={handleToggleAllChanges}
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className={sectionLabelClass}>4. CAB Feriado</h3>
        <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Filtra e gera o e-mail do CAB para um feriado prolongado: indique quantos dias a janela deve abranger
            (ex: o Fim de Semana equivale a 3 dias – sexta 18h – segunda 07h), mantendo sempre o horário 18:00 – 07:00.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-sky-600 dark:text-sky-300 block mb-1">
                Quantidade de Dias (a partir de hoje 18h)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={feriadoDias}
                onChange={(e) => setFeriadoDias(e.target.value)}
                disabled={!feriadoUnlocked}
                placeholder="Ex: 4"
                className="w-full bg-slate-100 dark:bg-slate-900/60 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => setFeriadoUnlocked((u) => !u)}
                className="w-full bg-slate-500 hover:bg-slate-400 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
              >
                {feriadoUnlocked ? "🔒 Bloquear" : "🔓 Unlock"}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleFiltrarFeriado}
              className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
            >
              Filtro CAB Feriado
            </button>
            <button
              type="button"
              onClick={handleEnviarFeriado}
              disabled={sending}
              className="bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
            >
              E-mail Feriado
            </button>
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className={`${sectionLabelClass} mb-0`}>5. Resultado do Filtro CAB</h3>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Janela: <span className="text-sky-600 dark:text-sky-300 font-mono font-semibold">{windowLabel}</span>
          </span>
        </div>
        <div className="flex gap-2 flex-wrap mb-3">
          <button
            type="button"
            onClick={() => applyFilter(false)}
            className="bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors"
          >
            ⏱ Filtro Diário 18h – 07h
          </button>
          <button
            type="button"
            onClick={() => applyFilter(true)}
            className="bg-purple-700 hover:bg-purple-600 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors"
          >
            📅 Filtro Fim de Semana
          </button>
        </div>
        <div className="bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-300">
              Changes filtrados na janela (cruzamento Task number / Number.1 ↔ Number)
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
              {resultado.length} / {outageRows.length} registos
            </span>
          </div>
          <ImportedDataTable rows={resultado} emptyLabel='Importe ambos os ficheiros e clique em "Filtro" para ver o resultado.' />
        </div>
      </div>

      <div>
        <h3 className={sectionLabelClass}>6. Gerar E-mail no Outlook</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => handleEnviar("DIARIO")}
            disabled={sending}
            className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-xs transition-colors"
          >
            {sending ? "A gerar…" : "Gerar Report CAB Diário"}
          </button>
          <button
            type="button"
            onClick={() => handleEnviar("FDS")}
            disabled={sending}
            className="bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-xs transition-colors"
          >
            {sending ? "A gerar…" : "Gerar Report CAB Fim de Semana"}
          </button>
        </div>

        {feedback && (
          <p
            className={`mt-3 text-sm ${
              feedback.type === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
            }`}
          >
            {feedback.message}
          </p>
        )}
      </div>
    </div>
  );
}
