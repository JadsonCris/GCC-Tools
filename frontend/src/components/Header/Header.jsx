import { useNavigate } from "react-router-dom";

export default function Header() {
  const navigate = useNavigate();
  const d = new Date();
    
  const dia = d.getDate().toString().padStart(2, '0'); 
  const mes = d.toLocaleDateString("pt-BR", { month: "long" });
  const ano = d.getFullYear();

  const dataFormatada = `${dia} ${mes} ${ano}`; 

  return (
    <header
      className="
      h-20
      bg-slate-950
      border-b
      border-slate-800
      flex
      items-center
      justify-between
      px-8
      "
    >
      <div>

        <h2 className="text-2xl text-white font-bold">
          Service Dashboard
        </h2>

        <p className="text-slate-400 capitalize">
          {dataFormatada}
        </p>

      </div>

      <button
        onClick={() => navigate('/')}
        className="
        bg-blue-600
        hover:bg-blue-700
        px-5
        py-2
        rounded-lg
        "
      >
        Dashboard Home
      </button>

    </header>
  );
}