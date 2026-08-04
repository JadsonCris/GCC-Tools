// components/Turnos/EstatisticasTab.jsx
// Reaproveitado pra "Estatísticas Mensais" (isAnnual=false, months=[mês
// atual]) e "Estatísticas Anuais" (isAnnual=true, months=1..12) — mesma
// lógica da ferramenta original, só o cálculo por trás muda (ver
// utils/turnosCalc.js).
import { computeEmployeeMonth, computeEmployeeAnnual } from "../../utils/turnosCalc";

const RANK_COLORS = ["#f0b429", "#9aa5b1", "#cd7f32"];

function RankCard({ title, icon, items, valueFn, suffix }) {
  const sorted = [...items].sort((a, b) => valueFn(b) - valueFn(a) || a.name.localeCompare(b.name));
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-4">
      <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">{icon} {title}</h3>
      {sorted.length === 0 && <p className="text-xs text-slate-400">Sem operadores visíveis.</p>}
      {sorted.map((it, i) => (
        <div key={it.name} className="flex items-center gap-2 py-1.5 border-b border-dashed border-slate-100 dark:border-slate-800 last:border-none text-sm">
          <span
            className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-extrabold text-white flex-shrink-0"
            style={{ background: RANK_COLORS[i] || "#212E5E" }}
          >
            {i + 1}
          </span>
          <span className="flex-1 font-medium text-slate-700 dark:text-slate-200">{it.name}</span>
          <span className="font-extrabold text-slate-800 dark:text-white">{valueFn(it)}{suffix || ""}</span>
        </div>
      ))}
    </div>
  );
}

export default function EstatisticasTab({ employees, yearShifts, year, months, title, isAnnual }) {
  const visible = employees.filter((e) => !e.hidden);

  const perEmp = visible.map((emp) => {
    const dm = yearShifts[String(emp.id)] || {};
    const stats = isAnnual ? computeEmployeeAnnual(dm, year) : computeEmployeeMonth(dm, year, months[0]);
    return { name: emp.name, nMonths: 1, ...stats };
  });

  const totals = perEmp.reduce(
    (acc, e) => ({
      M: acc.M + e.M, T: acc.T + e.T, N: acc.N + e.N, I: acc.I + e.I, F: acc.F + e.F,
      night: acc.night + e.night, worked: acc.worked + e.worked, fdsTrab: acc.fdsTrab + e.fdsTrab,
    }),
    { M: 0, T: 0, N: 0, I: 0, F: 0, night: 0, worked: 0, fdsTrab: 0 }
  );

  return (
    <div className="space-y-8">
      <h2 className="text-lg font-bold text-slate-800 dark:text-white">Rankings — {title} · Todos os operadores visíveis</h2>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <RankCard title="Dias trabalhados" icon="💪" items={perEmp} valueFn={(x) => x.worked} />
        <RankCard title="Horas noturnas" icon="🌙" items={perEmp} valueFn={(x) => x.night} suffix="h" />
        <RankCard title="Dias de férias" icon="🏖️" items={perEmp} valueFn={(x) => x.F} />
        <RankCard title="FDS trabalhados" icon="📅" items={perEmp} valueFn={(x) => x.fdsTrab} />
      </div>

      <div>
        <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-3">Totais por colaborador</h2>
        <div className="overflow-x-auto border border-slate-300 dark:border-slate-800 rounded-xl">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-800 text-white text-xs uppercase">
                <th className="text-left px-3 py-2">Colaborador</th>
                <th className="px-3 py-2">Manhã</th>
                <th className="px-3 py-2">Tarde</th>
                <th className="px-3 py-2">Noite</th>
                <th className="px-3 py-2">Interm.</th>
                <th className="px-3 py-2">Férias</th>
                <th className="px-3 py-2">Dias Trab.</th>
                <th className="px-3 py-2">H. Noturnas</th>
                <th className="px-3 py-2">FDS Trab.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {perEmp.map((e) => (
                <tr key={e.name}>
                  <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200">{e.name}</td>
                  <td className="text-center">{e.M}</td>
                  <td className="text-center">{e.T}</td>
                  <td className="text-center">{e.N}</td>
                  <td className="text-center">{e.I}</td>
                  <td className="text-center text-sky-600 dark:text-sky-400">{e.F}</td>
                  <td className="text-center font-bold text-emerald-600 dark:text-emerald-400">{e.worked}</td>
                  <td className="text-center">{e.night}h</td>
                  <td className="text-center">{e.fdsTrab}</td>
                </tr>
              ))}
              <tr className="font-extrabold bg-emerald-50 dark:bg-emerald-950/30">
                <td className="px-3 py-2 text-slate-800 dark:text-white">TOTAL</td>
                <td className="text-center">{totals.M}</td>
                <td className="text-center">{totals.T}</td>
                <td className="text-center">{totals.N}</td>
                <td className="text-center">{totals.I}</td>
                <td className="text-center">{totals.F}</td>
                <td className="text-center">{totals.worked}</td>
                <td className="text-center">{totals.night}h</td>
                <td className="text-center">{totals.fdsTrab}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <PctDistribution perEmp={perEmp} />

      {isAnnual && <AnnualAverages perEmp={perEmp} />}
    </div>
  );
}

function PctDistribution({ perEmp }) {
  const COLORS = { M: "#4CAF87", T: "#F5D06F", N: "#E05B4A", I: "#5A5A5A" };
  return (
    <div>
      <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-3">Distribuição % de turnos por operador</h2>
      <div className="flex flex-wrap gap-4 mb-3 text-xs text-slate-500 dark:text-slate-400">
        {Object.entries({ M: "Manhã", T: "Tarde", N: "Noite", I: "Interm." }).map(([k, label]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: COLORS[k] }} />
            {label}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto border border-slate-300 dark:border-slate-800 rounded-xl">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-800 text-white text-xs uppercase">
              <th className="text-left px-3 py-2">Colaborador</th>
              <th className="px-3 py-2 min-w-[200px]">Distribuição</th>
              <th className="px-3 py-2">Manhã</th>
              <th className="px-3 py-2">Tarde</th>
              <th className="px-3 py-2">Noite</th>
              <th className="px-3 py-2">Interm.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {perEmp.map((e) => {
              const tot = e.M + e.T + e.N + e.I;
              const pct = (v) => (tot > 0 ? Math.round((v / tot) * 100) : 0);
              const pM = pct(e.M), pT = pct(e.T), pN = pct(e.N), pI = pct(e.I);
              return (
                <tr key={e.name}>
                  <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200">{e.name}</td>
                  <td className="px-3 py-2">
                    {tot > 0 ? (
                      <div className="flex h-5 rounded overflow-hidden border border-slate-300 dark:border-slate-700 min-w-[180px]">
                        {[["M", pM], ["T", pT], ["N", pN], ["I", pI]].map(([k, p]) => (
                          <div key={k} style={{ width: `${p}%`, background: COLORS[k] }} className="flex items-center justify-center text-[9px] font-bold text-white">
                            {p >= 8 ? `${p}%` : ""}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">sem dados</span>
                    )}
                  </td>
                  <td className="text-center">{pM}%</td>
                  <td className="text-center">{pT}%</td>
                  <td className="text-center">{pN}%</td>
                  <td className="text-center">{pI}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AnnualAverages({ perEmp }) {
  const avg = (v, n) => (v / n).toFixed(1);
  const sums = perEmp.reduce(
    (acc, e) => {
      const n = e.nMonths || 1;
      return {
        M: acc.M + e.M / n, T: acc.T + e.T / n, N: acc.N + e.N / n, I: acc.I + e.I / n,
        worked: acc.worked + e.worked / n, night: acc.night + e.night / n, nOps: acc.nOps + 1,
      };
    },
    { M: 0, T: 0, N: 0, I: 0, worked: 0, night: 0, nOps: 0 }
  );
  const { nOps } = sums;

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-1">Médias mensais (ano) — por operador</h2>
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">Médias calculadas sobre os meses com atividade de cada operador.</p>
      <div className="overflow-x-auto border border-slate-300 dark:border-slate-800 rounded-xl">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-800 text-white text-xs uppercase">
              <th className="text-left px-3 py-2">Colaborador</th>
              <th className="px-3 py-2">Manhã/mês</th>
              <th className="px-3 py-2">Tarde/mês</th>
              <th className="px-3 py-2">Noite/mês</th>
              <th className="px-3 py-2">Interm./mês</th>
              <th className="px-3 py-2">Dias Trab./mês</th>
              <th className="px-3 py-2">H. Noturnas/mês</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {perEmp.map((e) => {
              const n = e.nMonths || 1;
              return (
                <tr key={e.name}>
                  <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200">{e.name}</td>
                  <td className="text-center">{avg(e.M, n)}</td>
                  <td className="text-center">{avg(e.T, n)}</td>
                  <td className="text-center">{avg(e.N, n)}</td>
                  <td className="text-center">{avg(e.I, n)}</td>
                  <td className="text-center font-bold text-emerald-600 dark:text-emerald-400">{avg(e.worked, n)}</td>
                  <td className="text-center">{avg(e.night, n)}h</td>
                </tr>
              );
            })}
            {nOps > 0 && (
              <tr className="font-extrabold bg-emerald-50 dark:bg-emerald-950/30">
                <td className="px-3 py-2 text-slate-800 dark:text-white">MÉDIA DA EQUIPA</td>
                <td className="text-center">{(sums.M / nOps).toFixed(1)}</td>
                <td className="text-center">{(sums.T / nOps).toFixed(1)}</td>
                <td className="text-center">{(sums.N / nOps).toFixed(1)}</td>
                <td className="text-center">{(sums.I / nOps).toFixed(1)}</td>
                <td className="text-center">{(sums.worked / nOps).toFixed(1)}</td>
                <td className="text-center">{(sums.night / nOps).toFixed(1)}h</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
