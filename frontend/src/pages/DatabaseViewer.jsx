// pages/DatabaseViewer.jsx
// "Base de Dados" — escolhe uma tabela e vê o conteúdo real da
// dashboard.db, sem precisar de ir ao servidor/BD diretamente (ver
// backend/routers/db_admin.py). Também permite carregar uma tabela à
// mão (upload real pro SQLite, ver ManualUploadPanel) pra quando a busca
// automática ao ServiceNow falhar.
import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getTables, getTableData, getImportableTables, uploadTable } from "../service/dbAdminApi";
import { listMembers, addMember, updateMember, removeMember } from "../service/teamApi";

const PAGE_SIZE = 50;

function errorDetail(err, fallback) {
  return err?.response?.data?.detail || fallback;
}

function TeamManagementPanel() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newTeam, setNewTeam] = useState("");

  const { data: members = [], isLoading } = useQuery({ queryKey: ["team-members"], queryFn: listMembers });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["team-members"] });

  const addMutation = useMutation({
    mutationFn: addMember,
    onSuccess: () => {
      invalidate();
      setNewName("");
      setNewUsername("");
      setNewTeam("");
    },
    onError: (err) => alert(errorDetail(err, "Erro ao adicionar pessoa.")),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, patch }) => updateMember(id, patch),
    onSuccess: invalidate,
    onError: (err) => alert(errorDetail(err, "Erro ao atualizar.")),
  });
  const removeMutation = useMutation({
    mutationFn: removeMember,
    onSuccess: invalidate,
    onError: (err) => alert(errorDetail(err, "Erro ao remover.")),
  });

  function handleAdd(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    addMutation.mutate({ name: newName.trim(), username: newUsername.trim() || null, team: newTeam || null });
  }

  const selectClass = "px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-white";

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-800 p-5 space-y-4">
      <div>
        <h2 className="font-bold text-slate-800 dark:text-white">Gestão de Equipa</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Roster único da equipa (nome, equipa PT/BR, admin, oculto de métricas) — antes espalhado por vários
          ficheiros de código, agora tudo aqui. Quem tiver "Admin" marcado vê "Gestão de Turnos" e "Base de Dados".
        </p>
      </div>

      {isLoading ? (
        <p className="text-slate-500 text-sm">A carregar...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <th className="py-2 pr-3">Nome</th>
                <th className="py-2 pr-3">Código</th>
                <th className="py-2 pr-3">Equipa</th>
                <th className="py-2 pr-3 text-center">Admin</th>
                <th className="py-2 pr-3 text-center">Oculto</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="py-2 pr-3 font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">
                    {m.name} {m.is_bot && <span className="text-[10px] font-normal text-slate-400">(bot)</span>}
                  </td>
                  <td className="py-2 pr-3 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">{m.username || "—"}</td>
                  <td className="py-2 pr-3">
                    <select
                      value={m.team || ""}
                      disabled={m.is_bot}
                      onChange={(e) => updateMutation.mutate({ id: m.id, patch: { team: e.target.value || null } })}
                      className={selectClass}
                    >
                      <option value="">—</option>
                      <option value="PT">PT</option>
                      <option value="BR">BR</option>
                    </select>
                  </td>
                  <td className="py-2 pr-3 text-center">
                    <input
                      type="checkbox"
                      checked={m.is_admin}
                      onChange={(e) => updateMutation.mutate({ id: m.id, patch: { is_admin: e.target.checked } })}
                      className="accent-emerald-500"
                    />
                  </td>
                  <td className="py-2 pr-3 text-center">
                    <input
                      type="checkbox"
                      checked={m.is_hidden}
                      onChange={(e) => updateMutation.mutate({ id: m.id, patch: { is_hidden: e.target.checked } })}
                      className="accent-amber-500"
                    />
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeMutation.mutate(m.id)}
                      className="text-rose-500 hover:text-rose-700 text-xs font-bold"
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
              {!members.length && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-slate-400 text-sm">
                    Ninguém no roster ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={handleAdd} className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nome completo"
          className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-white"
        />
        <input
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
          placeholder="Código (opcional)"
          className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-white w-36"
        />
        <select value={newTeam} onChange={(e) => setNewTeam(e.target.value)} className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-white">
          <option value="">Sem equipa</option>
          <option value="PT">PT</option>
          <option value="BR">BR</option>
        </select>
        <button
          type="submit"
          disabled={addMutation.isPending || !newName.trim()}
          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
        >
          + Adicionar pessoa
        </button>
      </form>
    </div>
  );
}

// Upload manual pra dentro de uma tabela — pra quando a busca automática
// ao ServiceNow falhar (ver backend/cache.py ingest_manual_upload). Ao
// contrário do import do CAB (parseado só no browser, nunca chega ao
// backend), este ENVIA o ficheiro pro servidor e grava direto no SQLite,
// na hora — não fica só em downloads/ à espera do próximo ciclo.
function ManualUploadPanel() {
  const queryClient = useQueryClient();
  const inputId = useId();
  const [table, setTable] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState(null);

  const { data: importableTables = [] } = useQuery({
    queryKey: ["db-importable-tables"],
    queryFn: getImportableTables,
  });
  const selected = importableTables.find((t) => t.table === table);

  const uploadMutation = useMutation({
    mutationFn: ({ table, file }) => uploadTable(table, file),
    onSuccess: (data) => {
      setStatus({ type: "success", message: `'${data.table}' atualizada — ${data.rows} linha(s) processada(s).` });
      queryClient.invalidateQueries({ queryKey: ["db-tables"] });
      queryClient.invalidateQueries({ queryKey: ["db-table-data"] });
    },
    onError: (err) => setStatus({ type: "error", message: errorDetail(err, "Erro ao carregar o ficheiro.") }),
  });

  function handleFile(file) {
    if (!file) return;
    if (!table) {
      setStatus({ type: "error", message: "Escolha primeiro a tabela de destino." });
      return;
    }
    setStatus(null);
    uploadMutation.mutate({ table, file });
  }

  const disabled = !table || uploadMutation.isPending;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-800 p-5 space-y-4">
      <div>
        <h2 className="font-bold text-slate-800 dark:text-white">Carregar Tabela Manualmente</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Se a busca automática ao ServiceNow falhar, descarregue o ficheiro certo abaixo (mesmo link/colunas da busca
          automática — evita exportar de outra lista com colunas a menos) e carregue-o aqui. Grava direto na base de
          dados, sem esperar pelo próximo ciclo automático.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={table}
          onChange={(e) => { setTable(e.target.value); setStatus(null); }}
          className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-white"
        >
          <option value="">Escolha a tabela de destino...</option>
          {importableTables.map((t) => (
            <option key={t.table} value={t.table}>{t.table}</option>
          ))}
        </select>

        {table && (
          selected?.download_url ? (
            <button
              type="button"
              onClick={() => window.open(selected.download_url, "_blank")}
              className="bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold px-3 py-2 rounded-lg transition-colors"
            >
              ↓ Descarregar de "{table}" do ServiceNow
            </button>
          ) : (
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              Sem link direto — esta tabela vem do SharePoint, descarregue manualmente.
            </span>
          )
        )}
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFile(e.dataTransfer.files[0]);
        }}
        className={`rounded-lg p-4 flex flex-col items-center gap-2 border border-dashed transition-colors ${
          dragOver
            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
            : "border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40"
        } ${disabled ? "opacity-50" : ""}`}
      >
        <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
          Arraste o ficheiro aqui ou clique abaixo
        </p>
        <input
          type="file"
          id={inputId}
          accept=".xls,.xlsx,.xlsm,.csv"
          disabled={disabled}
          className="hidden"
          onChange={(e) => handleFile(e.target.files[0])}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => document.getElementById(inputId).click()}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
        >
          {uploadMutation.isPending ? "A carregar…" : "Selecionar ficheiro"}
        </button>
      </div>

      {status && (
        <p className={`text-xs ${status.type === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500 dark:text-rose-400"}`}>
          {status.message}
        </p>
      )}
    </div>
  );
}

export default function DatabaseViewer() {
  const [table, setTable] = useState(null);
  const [page, setPage] = useState(0);
  const [sortCol, setSortCol] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);

  const { data: tables = [], isLoading: loadingTables, isError: isTablesError } = useQuery({
    queryKey: ["db-tables"],
    queryFn: getTables,
  });

  const activeTable = table ?? tables[0]?.name ?? null;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["db-table-data", activeTable, page, sortCol, sortAsc],
    queryFn: () => getTableData(activeTable, PAGE_SIZE, page * PAGE_SIZE, sortCol, sortAsc ? "asc" : "desc"),
    enabled: !!activeTable,
  });

  function selectTable(name) {
    setTable(name);
    setPage(0);
    setSortCol(null);
  }

  function toggleSort(col) {
    if (sortCol === col) setSortAsc((a) => !a);
    else {
      setSortCol(col);
      setSortAsc(true);
    }
    setPage(0); // a página atual perde o sentido quando a ordenação (sobre a tabela inteira) muda
  }

  const rows = data?.rows ?? [];

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Base de Dados</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Consulta rápida ao conteúdo real da dashboard.db — escolhe uma tabela para ver as linhas guardadas.
        </p>
      </div>

      <ManualUploadPanel />

      <TeamManagementPanel />

      {loadingTables && <p className="text-slate-500 text-sm">A carregar tabelas...</p>}
      {isTablesError && <p className="text-rose-500 dark:text-rose-400 text-sm">Erro ao listar as tabelas.</p>}

      {!loadingTables && !isTablesError && (
        <div className="flex flex-wrap gap-2">
          {tables.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => selectTable(t.name)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                activeTable === t.name
                  ? "bg-emerald-500 border-emerald-500 text-white"
                  : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-400"
              }`}
            >
              {t.name} <span className="opacity-70">({t.row_count})</span>
            </button>
          ))}
          {!tables.length && <p className="text-slate-500 text-sm">Ainda sem tabelas na base de dados.</p>}
        </div>
      )}

      {activeTable && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-300 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="font-bold text-slate-800 dark:text-white font-mono">{activeTable}</h2>
            {data && (
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  {data.total} linha(s) — página {page + 1} de {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 disabled:opacity-30"
                >
                  ←
                </button>
                <button
                  type="button"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 disabled:opacity-30"
                >
                  →
                </button>
              </div>
            )}
          </div>

          {isLoading && <p className="text-slate-500 text-sm">A carregar...</p>}
          {isError && <p className="text-rose-500 dark:text-rose-400 text-sm">Erro ao carregar a tabela.</p>}

          {!isLoading && !isError && data && (
            <div className="overflow-auto max-h-[560px] border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="text-xs border-collapse w-full">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
                  <tr>
                    {data.columns.map((c) => (
                      <th
                        key={c}
                        onClick={() => toggleSort(c)}
                        className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap cursor-pointer select-none border-b border-slate-200 dark:border-slate-700"
                      >
                        {c} {sortCol === c && (sortAsc ? "▲" : "▼")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {rows.map((r, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-slate-50 dark:bg-slate-900/60"}>
                      {data.columns.map((c) => (
                        <td
                          key={c}
                          className="px-3 py-1.5 whitespace-nowrap text-slate-700 dark:text-slate-200 max-w-xs truncate"
                          title={r[c] == null ? "" : String(r[c])}
                        >
                          {r[c] == null || r[c] === "" ? "—" : String(r[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr>
                      <td colSpan={data.columns.length} className="text-center py-6 text-slate-400">
                        Tabela vazia.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
