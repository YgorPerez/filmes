import { definirFerramenta } from "../ferramenta.ts";

export default definirFerramenta({
  nome: "sessoes_abertas",
  descricao:
    "Lista as Sessões sem Feedback, a mais recente primeiro: id, data, Presentes, o pedido e a Recomendação " +
    "(posição, id, título). Antes de recomendar, pergunte ao Dono pela Sessão aberta, em uma linha.",
  entrada: {},
  cli: () => ({ comando: "sessoes-abertas" }),
});
