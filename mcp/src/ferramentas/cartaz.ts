import { z } from "zod";
import { definirFerramenta } from "../ferramenta.ts";

export default definirFerramenta({
  nome: "cartaz",
  descricao:
    "Gera o cartaz HTML da Recomendação gravada numa Sessão: um card por filme com capa, nota do IMDb, " +
    "título em português, sinopse, ficha e, em \"Por que cada um vai gostar\", a Evidência mais forte de cada Presente. " +
    "Devolve `arquivo` (caminho absoluto do .html), `filmes` (quantos cards) e `avisos`. " +
    "No T3 Code, mostre o arquivo com html_render (path) e não repita as linhas em texto.",
  entrada: {
    sessao: z.string().min(1).describe("ID da Sessão devolvido em sessao.id por recomendar"),
  },
  cli: ({ sessao }) => ({ comando: "cartaz", args: [`--sessao=${sessao}`] }),
});
