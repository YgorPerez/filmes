import { definirFerramenta } from "../ferramenta.ts";

export default definirFerramenta({
  nome: "atualizar",
  descricao: "Baixa os dumps do IMDb e do Wikidata e fixa suas versões. O banco muda depois de reconstruir.",
  entrada: {},
  cli: () => ({ comando: "atualizar" }),
});
