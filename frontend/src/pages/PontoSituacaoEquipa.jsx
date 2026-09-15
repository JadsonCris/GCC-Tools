// pages/PontoSituacaoEquipa.jsx
import { useQuery } from "@tanstack/react-query";
import ReferenceDataPanel from "../components/PontoSituacao/ReferenceDataPanel";
import EmailRequestForm from "../components/PontoSituacao/EmailRequestForm";
import { getReportsExportConfig } from "../service/reportsApi";

export default function PontoSituacaoEquipa() {
  const { data: exportConfig } = useQuery({
    queryKey: ["reports-export-config"],
    queryFn: getReportsExportConfig,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Ponto de Situação — Equipa</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Pede o estado de incidentes em aberto a uma equipa ServiceNow.
        </p>
      </div>

      <ReferenceDataPanel exportConfig={exportConfig} />
      <EmailRequestForm vista="equipa" />
    </div>
  );
}
