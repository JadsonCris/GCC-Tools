import DateRangeFilter from "../components/Filters/DateRangeFilter";
import SlaDetailSection from "../components/Sections/SlaDetailSection";

function SLA() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">Report SLAs</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Tendência mensal de cada SLA (clica num card SLA Cumprido/Falhado/Justificado pra ver os incidentes).
          Números atuais de SLA1-4, operadores e ferramentas já estão na Visão Geral — aqui só o detalhe extra.
        </p>
      </div>
      <DateRangeFilter />
      <SlaDetailSection />
    </div>
  );
}

export default SLA;
