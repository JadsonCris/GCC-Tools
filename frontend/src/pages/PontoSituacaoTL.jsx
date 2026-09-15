// pages/PontoSituacaoTL.jsx
import EmailRequestForm from "../components/PontoSituacao/EmailRequestForm";

export default function PontoSituacaoTL() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Ponto de Situação — TL's</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Pede o estado a um Team Leader e Backup TL de uma aplicação (CMDB).
        </p>
      </div>

      <EmailRequestForm vista="tl" />
    </div>
  );
}
