// components/PontoSituacao/ReferenceDataPanel.jsx
// Card colapsável "Gerir Dados de Referência" — as 4 tabelas (Incidentes
// Abertos, Utilizadores, Membros de Equipas, Aplicações) usadas pelas
// duas vistas do Ponto de Situação (Equipa/TL's) pra resolver e-mails e
// cruzar incidentes. Só aparece na página Equipa (igual à ferramenta
// original) — a TL's usa os mesmos dados sem ter o seu próprio import.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ImportDropzone from "../Reports/ImportDropzone";
import { getStatus, importarTabela, limparTabela } from "../../service/pontoSituacaoApi";

const NOMES_TABELAS = { incsopen: "Incidentes", userscmdb: "Utilizadores", equipas: "Membros", apps: "Aplicações" };

const SLOTS = [
  {
    tabela: "incsopen",
    label: "Incidentes Abertos",
    accent: "blue",
    descricao: null,
    aviso: null,
    comModo: false,
  },
  {
    tabela: "userscmdb",
    label: "Utilizadores",
    accent: "emerald",
    aviso: "⚠ O ServiceNow limita exportações a ~32000 linhas — se a lista for maior, exporte por lotes (ex: por letra inicial do nome) e use \"Adicionar\" a partir do 2º ficheiro.",
    comModo: true,
  },
  {
    tabela: "equipas",
    label: "Membros de Equipas",
    accent: "blue",
    aviso: "⚠ O ServiceNow limita exportações a ~32000 linhas — se a lista for maior, exporte por lotes e use \"Adicionar\" a partir do 2º ficheiro.",
    nota: "A lista de equipas usada no autocomplete é derivada diretamente desta tabela.",
    comModo: true,
  },
  {
    tabela: "apps",
    label: "Aplicações (CMDB)",
    accent: "emerald",
    aviso: null,
    comModo: true,
  },
];

function formatarDataHora(iso) {
  if (!iso) return null;
  const d = new Date(iso.replace(" ", "T"));
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("pt-PT") + " " + d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

export default function ReferenceDataPanel({ exportConfig }) {
  const [aberto, setAberto] = useState(false);
  const [modos, setModos] = useState({ userscmdb: "substituir", equipas: "substituir", apps: "substituir" });
  const [infoPorTabela, setInfoPorTabela] = useState({});
  const [fileNamePorTabela, setFileNamePorTabela] = useState({});
  const queryClient = useQueryClient();

  const { data: status, isError: isStatusError } = useQuery({
    queryKey: ["ponto-situacao-status"],
    queryFn: getStatus,
    refetchOnWindowFocus: false,
  });

  function invalidarTudo() {
    queryClient.invalidateQueries({ queryKey: ["ponto-situacao-status"] });
    queryClient.invalidateQueries({ queryKey: ["ponto-situacao-grupos"] });
    queryClient.invalidateQueries({ queryKey: ["ponto-situacao-aplicacoes"] });
  }

  function setInfo(tabela, node) {
    setInfoPorTabela((prev) => ({ ...prev, [tabela]: node }));
  }

  async function handleImport(tabela, rows, fileName) {
    setInfo(tabela, { type: "loading", text: `A guardar ${rows.length} linhas…` });
    setFileNamePorTabela((prev) => ({ ...prev, [tabela]: fileName }));
    try {
      const data = await importarTabela(tabela, rows, modos[tabela] || "substituir");
      setInfo(tabela, { type: "success", text: data.message });
    } catch (err) {
      setInfo(tabela, { type: "error", text: err.response?.data?.detail || err.message });
    } finally {
      invalidarTudo();
    }
  }

  async function handleLimpar(tabela) {
    if (!confirm(`Apagar todos os dados de "${NOMES_TABELAS[tabela]}"? Esta ação não pode ser desfeita.`)) return;
    try {
      const data = await limparTabela(tabela);
      setInfo(tabela, { type: "warning", text: "🗑 " + data.message });
    } catch (err) {
      setInfo(tabela, { type: "error", text: err.response?.data?.detail || err.message });
    } finally {
      invalidarTudo();
    }
  }

  // RESOLVIDO (bug real): sem isError, uma falha a buscar o estado caía
  // no `?? 0` de cada tabela e mostrava "Incidentes: 0 · Utilizadores: 0
  // · ... — base ainda não atualizada" — indistinguível de "nunca se
  // importou nada". Um admin podia achar que as tabelas de referência
  // estavam mesmo vazias e reimportar exports grandes à toa.
  const partes = SLOTS.map((s) => `${NOMES_TABELAS[s.tabela]}: ${status?.[s.tabela]?.linhas ?? 0}`);
  const maisRecente = SLOTS.map((s) => status?.[s.tabela]?.atualizado_em).filter(Boolean).sort().at(-1);
  const resumo = isStatusError
    ? "Dados de referência (locais) — erro ao carregar o estado atual, tenta recarregar a página."
    : `Dados de referência (locais) — ${partes.join(" · ")}${
        maisRecente ? ` — base atualizada em ${formatarDataHora(maisRecente)}` : " — base ainda não atualizada"
      }`;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{resumo}</p>
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          className="bg-slate-600 hover:bg-slate-500 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors"
        >
          🔧 Gerir Dados de Referência
        </button>
      </div>

      {aberto && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800 mb-5">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Dados de Referência</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Exportações CSV/EXCEL do ServiceNow, guardadas na base de dados local. Atualização mensal.
              </p>
            </div>
            <button
              type="button"
              onClick={invalidarTudo}
              className="bg-slate-600 hover:bg-slate-500 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors"
            >
              ↻ Atualizar estado
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {SLOTS.map((slot) => {
              const info = status?.[slot.tabela];
              const feedback = infoPorTabela[slot.tabela];
              const url = exportConfig?.pontoSituacao?.[slot.tabela]?.url;
              return (
                <div
                  key={slot.tabela}
                  className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{slot.label}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {info?.linhas ?? 0} linhas
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-500">
                    {info?.atualizado_em ? `Atualizado em ${formatarDataHora(info.atualizado_em)}` : "Ainda não importado"}
                  </div>
                  {url && (
                    <a href={url} target="_blank" rel="noreferrer" className="text-[11px] text-blue-500 hover:underline block">
                      ↓ Descarregar / abrir no ServiceNow
                    </a>
                  )}
                  {slot.aviso && <p className="text-[10px] text-amber-500 leading-tight">{slot.aviso}</p>}

                  {slot.comModo && (
                    <select
                      value={modos[slot.tabela]}
                      onChange={(e) => setModos((prev) => ({ ...prev, [slot.tabela]: e.target.value }))}
                      className="w-full text-[10px] py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
                    >
                      <option value="substituir">Substituir</option>
                      <option value="adicionar">Adicionar</option>
                    </select>
                  )}

                  <ImportDropzone
                    accent={slot.accent}
                    fileName={fileNamePorTabela[slot.tabela] || ""}
                    onImport={(rows, fileName) => handleImport(slot.tabela, rows, fileName)}
                  />

                  {feedback && (
                    <p
                      className={`text-[10px] ${
                        feedback.type === "error"
                          ? "text-red-500 dark:text-red-400"
                          : feedback.type === "warning"
                          ? "text-amber-500"
                          : "text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {feedback.text}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => handleLimpar(slot.tabela)}
                    className="text-[10px] text-red-500 hover:underline"
                  >
                    🗑 Limpar dados
                  </button>

                  {slot.nota && <p className="text-[10px] text-slate-400">{slot.nota}</p>}
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-400 mt-3">
            Exporte cada lista do ServiceNow em formato CSV/EXCEL e importe aqui. "Aplicações" suporta vários ficheiros
            em modo <em>Adicionar</em> quando a exportação do ServiceNow vem paginada.
          </p>
        </div>
      )}
    </div>
  );
}
