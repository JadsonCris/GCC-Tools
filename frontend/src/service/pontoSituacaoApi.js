// service/pontoSituacaoApi.js
import api from "./api";

export async function getStatus() {
  const { data } = await api.get("/ponto-situacao/status");
  return data;
}

export async function getGrupos() {
  const { data } = await api.get("/ponto-situacao/grupos");
  return data;
}

export async function getAplicacoes() {
  const { data } = await api.get("/ponto-situacao/aplicacoes");
  return data;
}

export async function importarTabela(tabela, linhas, modo = "substituir") {
  const { data } = await api.post(`/ponto-situacao/tabelas/${tabela}/importar`, { linhas, modo });
  return data;
}

export async function limparTabela(tabela) {
  const { data } = await api.delete(`/ponto-situacao/tabelas/${tabela}`);
  return data;
}

export async function pedidoEquipa(incidente, equipa) {
  const { data } = await api.post("/ponto-situacao/equipa", { incidente, equipa });
  return data;
}

export async function pedidoTL(incidente, aplicacao) {
  const { data } = await api.post("/ponto-situacao/tl", { incidente, aplicacao });
  return data;
}

export async function enviarPontoSituacao({ to, subject, body, cc }) {
  const { data } = await api.post("/ponto-situacao/enviar", { to, subject, body, cc });
  return data;
}
