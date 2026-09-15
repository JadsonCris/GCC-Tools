// components/PontoSituacao/EmailRequestForm.jsx
// Formulário de pedido de Ponto de Situação, partilhado pelas duas
// vistas (Equipa/TL's) — só muda o campo de entidade (Equipa vs
// Aplicação), a lista de autocomplete e o endpoint chamado. Os campos
// Emails/Corpo/Comentário são auto-preenchidos a cada alteração do
// Incidente/Entidade (debounce de 400ms), mas ficam "protegidos" assim
// que o utilizador os edita à mão — só o botão "↺ Recalcular
// automaticamente" volta a repor o valor calculado (mesma lógica da
// ferramenta original: aplicarValorComputado/recalcularCampo).
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getGrupos,
  getAplicacoes,
  pedidoEquipa,
  pedidoTL,
  enviarPontoSituacao,
} from "../../service/pontoSituacaoApi";

function linkAbrirINC(numero) {
  return `https://edpon.service-now.com/incident.do?sysparm_query=number=${encodeURIComponent(numero)}`;
}

export default function EmailRequestForm({ vista }) {
  const isEquipa = vista === "equipa";
  const accentText = isEquipa ? "text-blue-500" : "text-violet-500";

  const { data: opcoes = [] } = useQuery({
    queryKey: [isEquipa ? "ponto-situacao-grupos" : "ponto-situacao-aplicacoes"],
    queryFn: isEquipa ? getGrupos : getAplicacoes,
  });

  const [incidente, setIncidente] = useState("");
  const [entidade, setEntidade] = useState("");
  const [assunto, setAssunto] = useState("");
  const [incs, setIncs] = useState("");
  const [outros, setOutros] = useState([]);
  const [fields, setFieldsState] = useState({ emails: "", corpo: "", comentario: "" });
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const fieldsRef = useRef(fields);
  const lastComputedRef = useRef({ emails: "", corpo: "", comentario: "" });
  const lastResultRef = useRef(null);

  function setField(campo, valor) {
    fieldsRef.current = { ...fieldsRef.current, [campo]: valor };
    setFieldsState((prev) => ({ ...prev, [campo]: valor }));
  }

  function applyComputed(campo, novoValor) {
    const foiEditadoManualmente = fieldsRef.current[campo] !== lastComputedRef.current[campo];
    lastComputedRef.current[campo] = novoValor;
    if (!foiEditadoManualmente) {
      setField(campo, novoValor);
    }
  }

  function recalcularCampo(campo) {
    const valor = lastResultRef.current?.[campo] || "";
    lastComputedRef.current[campo] = valor;
    setField(campo, valor);
  }

  useEffect(() => {
    if (!incidente && !entidade) return undefined;
    const timer = setTimeout(async () => {
      try {
        const data = isEquipa ? await pedidoEquipa(incidente, entidade) : await pedidoTL(incidente, entidade);
        lastResultRef.current = data;
        applyComputed("emails", data.emails || "");
        setAssunto(data.assunto || "");
        applyComputed("corpo", data.corpo || "");
        applyComputed("comentario", data.comentario || "");
        setIncs(data.incs || "");
        setOutros(data.outros || []);
      } catch {
        setFeedback({ type: "error", message: "Servidor offline." });
      }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isEquipa vem de `vista`, fixo por instância; as funções internas são estáveis o suficiente para este debounce.
  }, [incidente, entidade]);

  async function handleGerarEmail() {
    setSending(true);
    setFeedback({ type: "info", message: "A gerar e-mail no Outlook… aguarde." });
    try {
      const data = await enviarPontoSituacao({
        to: fields.emails.trim(),
        subject: assunto.trim(),
        body: fields.corpo,
      });
      setFeedback({ type: "success", message: data.message });
    } catch (err) {
      setFeedback({ type: "error", message: err.response?.data?.detail || err.message });
    } finally {
      setSending(false);
    }
  }

  const labelEntidade = isEquipa ? "Equipa" : "Aplicação";
  const datalistId = isEquipa ? "lista-grupos-ps" : "lista-aplicacoes-ps";

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">
      <div className="flex items-center gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div
          className={`p-2.5 rounded-xl border text-lg ${
            isEquipa
              ? "bg-blue-500/10 text-blue-500 dark:text-blue-400 border-blue-500/20"
              : "bg-violet-500/10 text-violet-500 dark:text-violet-400 border-violet-500/20"
          }`}
        >
          ✉
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Pedido de Ponto de Situação — {isEquipa ? "Equipa" : "TL's"}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isEquipa
              ? "Pede o estado de todos os incidentes em aberto atribuídos a uma equipa ServiceNow."
              : "Pede o estado a um Team Leader e Backup TL de uma aplicação (CMDB)."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-x-4 gap-y-3 items-start">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 pt-2">Incidente</label>
        <input
          value={incidente}
          onChange={(e) => setIncidente(e.target.value)}
          placeholder={isEquipa ? "Ex: INC0063620" : "Ex: INC0060835"}
          className="field-input-ps"
        />

        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 pt-2">{labelEntidade}</label>
        <div className="space-y-1">
          <input
            value={entidade}
            onChange={(e) => setEntidade(e.target.value)}
            list={datalistId}
            placeholder={isEquipa ? "Nome exato do grupo ServiceNow (assignment group)" : "Nome exato da aplicação (CMDB)"}
            className="field-input-ps"
          />
          <datalist id={datalistId}>
            {opcoes.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
          <p className="text-[10px] text-red-500 font-semibold">Copiar apenas texto simples (nada de texto em link)</p>
        </div>

        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 pt-2">
          Emails {isEquipa ? "dos técnicos" : "dos TL's"}
        </label>
        <div className="space-y-1">
          <div className="flex justify-end">
            <button type="button" onClick={() => recalcularCampo("emails")} className={`text-[10px] hover:underline ${accentText}`}>
              ↺ Recalcular automaticamente
            </button>
          </div>
          <textarea
            value={fields.emails}
            onChange={(e) => setField("emails", e.target.value)}
            rows={2}
            placeholder="Preenchido automaticamente — pode editar ou adicionar mais emails"
            className="field-input-ps"
          />
        </div>

        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 pt-2">Assunto</label>
        <input value={assunto} readOnly className="field-input-ps opacity-80" />

        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 pt-2">Email</label>
        <div className="space-y-1">
          <div className="flex justify-end">
            <button type="button" onClick={() => recalcularCampo("corpo")} className={`text-[10px] hover:underline ${accentText}`}>
              ↺ Recalcular automaticamente
            </button>
          </div>
          <textarea value={fields.corpo} onChange={(e) => setField("corpo", e.target.value)} rows={9} className="field-input-ps" />
        </div>

        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 pt-2">Comentário</label>
        <div className="space-y-1">
          <div className="flex justify-end">
            <button type="button" onClick={() => recalcularCampo("comentario")} className={`text-[10px] hover:underline ${accentText}`}>
              ↺ Recalcular automaticamente
            </button>
          </div>
          <textarea
            value={fields.comentario}
            onChange={(e) => setField("comentario", e.target.value)}
            rows={3}
            className="field-input-ps"
          />
        </div>

        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 pt-2">INC's</label>
        <input value={incs} readOnly className="field-input-ps opacity-80" />
      </div>

      <button
        type="button"
        onClick={handleGerarEmail}
        disabled={sending}
        className={`${
          isEquipa ? "bg-blue-600 hover:bg-blue-500" : "bg-violet-600 hover:bg-violet-500"
        } disabled:opacity-50 text-white font-semibold py-2 px-5 rounded-lg text-sm transition-colors`}
      >
        {sending ? "A gerar…" : "✉ Gerar E-mail no Outlook"}
      </button>

      {feedback && (
        <p className={`text-sm ${feedback.type === "success" ? "text-emerald-600 dark:text-emerald-400" : feedback.type === "error" ? "text-red-600 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}`}>
          {feedback.message}
        </p>
      )}

      <div>
        <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
          Outros incidentes abertos da mesma {isEquipa ? "equipa" : "aplicação"}
        </p>
        <div className="bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-300">
              Cruzamento por {isEquipa ? "assignment_group" : "u_subcategory"}
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {outros.length} registos
            </span>
          </div>
          {outros.length === 0 ? (
            <p className="text-xs text-slate-400 p-3">Preencha o campo {labelEntidade} para ver os incidentes relacionados.</p>
          ) : (
            <div className="overflow-auto max-h-[260px]">
              <table className="text-xs border-collapse w-full">
                <thead>
                  <tr>
                    {["Incidente", "Estado", "Abertura", "Last update", "Equipa", ""].map((h) => (
                      <th key={h} className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-left px-2 py-1.5 font-semibold border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {outros.map((o, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-slate-50 dark:bg-slate-900/60"}>
                      <td className="px-2 py-1">{o.numero ?? ""}</td>
                      <td className="px-2 py-1">{o.estado ?? ""}</td>
                      <td className="px-2 py-1">{o.abertura ?? ""}</td>
                      <td className="px-2 py-1">{o.ultima_atualizacao ?? ""}</td>
                      <td className="px-2 py-1">{o.grupo ?? ""}</td>
                      <td className="px-2 py-1">
                        <a href={linkAbrirINC(o.numero)} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
                          Abrir INC
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
