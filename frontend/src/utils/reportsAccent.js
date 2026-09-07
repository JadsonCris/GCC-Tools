// utils/reportsAccent.js
// Mapas de classes Tailwind ESTÁTICAS (não dá pra construir "bg-${cor}-600"
// dinamicamente — o Tailwind só reconhece classes que aparecem literais
// no código) pros accents usados nos componentes de Reports: blue
// (Ibéria/geral), emerald (Brasil), red (Outage/urgência).
export const ACCENT_BUTTON = {
  blue: "bg-blue-600 hover:bg-blue-500",
  emerald: "bg-emerald-600 hover:bg-emerald-500",
  red: "bg-red-600 hover:bg-red-500",
};

export const ACCENT_CARD_HOVER = {
  blue: "hover:border-blue-500/50 group-hover:text-blue-600 dark:group-hover:text-blue-400",
  red: "hover:border-red-500/50 group-hover:text-red-600 dark:group-hover:text-red-400",
  emerald: "hover:border-emerald-500/50 group-hover:text-emerald-600 dark:group-hover:text-emerald-400",
};

export const ACCENT_DROPZONE_DRAGOVER = {
  blue: "border-blue-500 bg-blue-50 dark:bg-blue-500/10",
  emerald: "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10",
  red: "border-red-500 bg-red-50 dark:bg-red-500/10",
};

export const ACCENT_BADGE = {
  blue: "bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300",
  emerald: "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300",
  red: "bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300",
};

export const ACCENT_TEXT = {
  blue: "text-blue-600 dark:text-blue-300",
  emerald: "text-emerald-600 dark:text-emerald-300",
  red: "text-red-600 dark:text-red-300",
};

// Separador ativo: fundo/card igual ao resto da app, só a cor do
// texto+contorno muda por região — evita misturar um `border-{cor}` com
// o `border-slate-*` do resto do contorno (mesma propriedade CSS, ordem
// de geração do Tailwind não é garantida entre os dois).
export const ACCENT_TAB_ACTIVE = {
  blue: "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 border border-b-0 border-blue-300 dark:border-blue-800",
  emerald: "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 border border-b-0 border-emerald-300 dark:border-emerald-800",
};

export const ACCENT_TAB_HOVER = {
  blue: "hover:text-blue-500 dark:hover:text-blue-400",
  emerald: "hover:text-emerald-500 dark:hover:text-emerald-400",
};
