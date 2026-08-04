// components/Turnos/EscalaTab.jsx
// Grelha de pintura de turnos — pinta em memória (draft local) e só
// grava na BD quando se clica em "Guardar" (decisão explícita: menos
// pedidos ao backend, mas perde-se o que não for guardado se saíres da
// página).
import { useEffect, useRef, useState } from "react";
import {
  createEmployee, deleteEmployee, updateEmployee, saveMonthShifts, clearMonth,
} from "../../service/turnosApi";
import {
  SHIFTS, WD, REQUIRED, MAX_FREE_STREAK,
  daysInMonth, weekdayOf, dayShift, shiftByKey, coverageByDay, longFreeStreaks,
} from "../../utils/turnosCalc";

function buildInitialDraft(employees, yearShifts, year, month) {
  const nDays = daysInMonth(year, month);
  const initial = {};
  employees.forEach((emp) => {
    const dm = yearShifts[String(emp.id)] || {};
    const dayMap = {};
    for (let d = 1; d <= nDays; d++) {
      const v = dayShift(dm, year, month, d);
      if (v) dayMap[d] = v;
    }
    initial[emp.id] = dayMap;
  });
  return initial;
}

// O componente pai monta este componente com `key={`${year}-${month}`}`
// (ver Turnos.jsx) — mudar de mês/ano força um remount completo, que é
// a forma recomendada pelo React de "reiniciar" estado local a partir
// de props, em vez de um useEffect a chamar setState (delonge
// cascatas de render desnecessárias). Depois de "Guardar" com sucesso
// não precisa de resincronizar: o rascunho JÁ é exatamente o que acabou
// de ser gravado.
export default function EscalaTab({ employees, yearShifts, year, month, onSaved, onDirtyChange }) {
  const [brush, setBrush] = useState("M");
  const [draft, setDraft] = useState(() => buildInitialDraft(employees, yearShifts, year, month));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPos, setNewPos] = useState("MOD");
  const isPaintingRef = useRef(false);

  const nDays = daysInMonth(year, month);
  const visible = employees.filter((e) => !e.hidden);
  const hidden = employees.filter((e) => e.hidden);
  const cov = coverageByDay(
    Object.fromEntries(visible.map((e) => [String(e.id), draft[e.id]
      ? Object.fromEntries(Object.entries(draft[e.id]).map(([d, s]) => [`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`, s]))
      : {}])),
    visible,
    year,
    month
  );

  function paint(empId, day) {
    setDraft((prev) => {
      const empDraft = { ...(prev[empId] || {}) };
      if (!brush) delete empDraft[day];
      else empDraft[day] = brush;
      return { ...prev, [empId]: empDraft };
    });
    setDirty(true);
    onDirtyChange?.(true);
  }

  useEffect(() => {
    const stop = () => { isPaintingRef.current = false; };
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await Promise.all(employees.map((emp) => saveMonthShifts(emp.id, year, month, draft[emp.id] || {})));
      setDirty(false);
      onDirtyChange?.(false);
      onSaved();
    } catch {
      alert("Erro ao guardar. Tenta novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddEmployee() {
    if (!newName.trim()) return;
    await createEmployee(newName.trim(), newPos.trim() || "MOD");
    setNewName("");
    onSaved();
  }
  async function handleToggleHide(emp) {
    await updateEmployee(emp.id, { hidden: !emp.hidden });
    onSaved();
  }
  async function handleShowAll() {
    await Promise.all(hidden.map((e) => updateEmployee(e.id, { hidden: false })));
    onSaved();
  }
  async function handleDelete(emp) {
    if (!confirm(`Remover ${emp.name}? Isto apaga também o histórico de turnos desse colaborador.`)) return;
    await deleteEmployee(emp.id);
    onSaved();
  }
  async function handleClearMonth() {
    if (!confirm(`Limpar os turnos de todos os colaboradores em ${year}-${String(month).padStart(2, "0")}?`)) return;
    await clearMonth(year, month);
    onSaved();
  }

  const problems = [];
  for (let d = 1; d <= nDays; d++) {
    const miss = REQUIRED.filter((r) => cov[d][r] === 0).map((r) => shiftByKey(r).label);
    if (miss.length) problems.push({ d, miss });
  }
  const restIssues = [];
  visible.forEach((emp) => {
    const dm = Object.fromEntries(
      Object.entries(draft[emp.id] || {}).map(([d, s]) => [`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`, s])
    );
    longFreeStreaks(dm, year, month).forEach((r) => restIssues.push({ name: emp.name, ...r }));
  });

  return (
    <div className="space-y-4">
      {/* Pincel */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl p-3">
        <span className="text-xs font-bold text-slate-600 dark:text-slate-300 mr-1">Pincel:</span>
        {SHIFTS.map((s) => (
          <button
            key={s.key || "apagar"}
            type="button"
            onClick={() => setBrush(s.key)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-colors ${
              brush === s.key
                ? "border-slate-800 dark:border-white bg-white dark:bg-slate-900"
                : "border-transparent bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700"
            }`}
          >
            <span
              className="w-3.5 h-3.5 rounded-full inline-block border border-black/10"
              style={{ background: s.color || "transparent", borderStyle: s.color ? "solid" : "dashed" }}
            />
            {s.label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">Alterações por guardar</span>}
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="px-4 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
          >
            {saving ? "A guardar..." : "Guardar"}
          </button>
          <button
            type="button"
            onClick={handleClearMonth}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 hover:bg-rose-200 dark:hover:bg-rose-900 transition-colors"
          >
            Limpar Mês
          </button>
        </div>
      </div>

      {/* Ocultos */}
      {hidden.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl px-3 py-2 text-xs">
          <span className="font-semibold text-amber-700 dark:text-amber-400">Ocultos (clica pra mostrar):</span>
          {hidden.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => handleToggleHide(e)}
              className="bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 rounded-full px-2.5 py-1 font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40"
            >
              {e.name} ↩
            </button>
          ))}
        </div>
      )}

      {/* Alertas */}
      <div className="space-y-2">
        {problems.length === 0 ? (
          <div className="text-sm rounded-lg px-4 py-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-l-4 border-emerald-500">
            ✓ Cobertura completa — todos os dias têm Manhã, Tarde e Noite preenchidas.
          </div>
        ) : (
          <div className="text-sm rounded-lg px-4 py-2 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-l-4 border-rose-500">
            <b>{problems.length} dia(s)</b> sem cobertura completa:{" "}
            {problems.map((p) => `Dia ${p.d} (falta ${p.miss.join(", ")})`).join(" · ")}
          </div>
        )}
        {restIssues.length > 0 && (
          <div className="text-sm rounded-lg px-4 py-2 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-l-4 border-amber-500">
            Mais de {MAX_FREE_STREAK} dias livres seguidos:{" "}
            {restIssues.map((r) => `${r.name} — dias ${r.start}–${r.end} (${r.len} dias)`).join(" · ")}
          </div>
        )}
      </div>

      {/* Grelha */}
      <div className="overflow-x-auto border border-slate-300 dark:border-slate-800 rounded-xl">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-slate-800 dark:bg-slate-800 text-white text-left px-2 py-2 min-w-[170px]">Colaborador</th>
              <th className="bg-slate-800 text-white px-2 py-2">Pos.</th>
              {Array.from({ length: nDays }, (_, i) => i + 1).map((d) => {
                const wd = weekdayOf(year, month, d);
                const gap = REQUIRED.some((r) => cov[d][r] === 0);
                return (
                  <th
                    key={d}
                    className={`px-1 py-2 text-white font-normal w-8 ${gap ? "bg-rose-700" : wd === 0 || wd === 6 ? "bg-slate-700" : "bg-slate-800"}`}
                    title={gap ? "Falta cobertura" : ""}
                  >
                    <div>{WD[wd]}</div>
                    <div>{d}</div>
                  </th>
                );
              })}
              <th className="bg-slate-800 text-white px-2 py-2">M</th>
              <th className="bg-slate-800 text-white px-2 py-2">T</th>
              <th className="bg-slate-800 text-white px-2 py-2">N</th>
              <th className="bg-slate-800 text-white px-2 py-2">I</th>
              <th className="bg-slate-800 text-white px-2 py-2">Férias</th>
              <th className="bg-slate-800 text-white px-2 py-2">H.Noct.</th>
              <th className="bg-slate-800 text-white px-2 py-2">Dias</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {visible.map((emp) => {
              const dm = draft[emp.id] || {};
              let cM = 0, cT = 0, cN = 0, cI = 0, cF = 0, night = 0, worked = 0;

              const cells = [];
              for (let d = 1; d <= nDays; d++) {
                const k = dm[d] || "";
                const s = shiftByKey(k);
                if (k === "M") cM++;
                if (k === "T") cT++;
                if (k === "N") cN++;
                if (k === "I") cI++;
                if (k === "F") cF++;
                if (s.count) { worked++; night += s.night; }

                const wd = weekdayOf(year, month, d);
                cells.push(
                  <td
                    key={d}
                    className={`text-center cursor-pointer select-none w-8 h-8 ${wd === 0 || wd === 6 ? "bg-slate-100 dark:bg-slate-950/60" : ""} hover:outline hover:outline-2 hover:outline-emerald-400 hover:-outline-offset-2`}
                    title={s.label}
                    onMouseDown={() => { isPaintingRef.current = true; paint(emp.id, d); }}
                    onMouseEnter={() => { if (isPaintingRef.current) paint(emp.id, d); }}
                  >
                    <div
                      className="w-5 h-5 rounded-full mx-auto flex items-center justify-center text-[9px] font-bold text-white"
                      style={{ background: k ? s.color : "transparent", border: k ? "1px solid rgba(0,0,0,.15)" : "1px dashed #94a3b8" }}
                    >
                      {s.short}
                    </div>
                  </td>
                );
              }

              return (
                <tr key={emp.id}>
                  <td className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-900 px-2 py-1 font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                    <button type="button" onClick={() => handleToggleHide(emp)} title="Ocultar" className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mr-1">
                      👁
                    </button>
                    {emp.name}
                    <button type="button" onClick={() => handleDelete(emp)} title="Remover" className="text-rose-500 hover:text-rose-700 ml-1 font-bold">
                      ×
                    </button>
                  </td>
                  <td className="bg-slate-50 dark:bg-slate-900 text-center text-slate-500 dark:text-slate-400">{emp.pos}</td>
                  {cells}
                  <td className="text-center font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400">{cM}</td>
                  <td className="text-center font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400">{cT}</td>
                  <td className="text-center font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400">{cN}</td>
                  <td className="text-center font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400">{cI}</td>
                  <td className="text-center font-semibold bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400">{cF}</td>
                  <td className="text-center font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400">{night}h</td>
                  <td className="text-center font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300">{worked}</td>
                </tr>
              );
            })}

            {[["M", "Manhã"], ["T", "Tarde"], ["N", "Noite"]].map(([key, label]) => (
              <tr key={key}>
                <td className="sticky left-0 z-10 bg-slate-100 dark:bg-slate-950 px-2 py-1 font-medium text-slate-500 dark:text-slate-400">
                  Cobertura {label}
                </td>
                <td className="bg-slate-100 dark:bg-slate-950">
                  <span className="w-3 h-3 rounded-full inline-block" style={{ background: shiftByKey(key).color }} />
                </td>
                {Array.from({ length: nDays }, (_, i) => i + 1).map((d) => {
                  const ok = cov[d][key] > 0;
                  return (
                    <td
                      key={d}
                      className={`text-center font-bold ${ok ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400" : "bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400"}`}
                      title={ok ? `${cov[d][key]} pessoa(s)` : "EM FALTA"}
                    >
                      {ok ? "✓" : "✗"}
                    </td>
                  );
                })}
                <td colSpan={7} className="bg-slate-100 dark:bg-slate-950"></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Adicionar colaborador */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nome do colaborador"
          className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white"
        />
        <input
          type="text"
          value={newPos}
          onChange={(e) => setNewPos(e.target.value)}
          placeholder="Pos."
          className="w-20 px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white"
        />
        <button type="button" onClick={handleAddEmployee} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white">
          + Adicionar colaborador
        </button>
        {hidden.length > 0 && (
          <button type="button" onClick={handleShowAll} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            Mostrar todos
          </button>
        )}
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500">
        Escolhe um turno no pincel e clica ou arrasta para pintar. As alterações só ficam gravadas depois de clicares em "Guardar".
      </p>
    </div>
  );
}
