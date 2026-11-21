import { z } from "zod";
import { definirFerramenta } from "../ferramenta.ts";

export default definirFerramenta({
  nome: "cartaz",
  descricao:
    "Gera o cartaz HTML da Recomendação gravada numa Sessão: um card por filme com capa, nota do IMDb, " +
    "título em português, sinopse, ficha e, em \"Por que cada um vai gostar\", a Evidência mais forte de cada Presente. " +
    "Com `filmes`, o cartaz traz só esses, na ordem dada e numerados de 1 em diante, e a Sessão guarda a lista " +
    "como mostrada, para o Feedback registrar a posição do Filme escolhido nela. " +
    "Devolve `arquivo` (caminho absoluto do .html), `filmes` (quantos cards) e `avisos`. " +
    "No T3 Code, mostre o arquivo com html_render (path) e não repita as linhas em texto.",
  entrada: {
    sessao: z.string().min(1).describe("ID da Sessão devolvido em sessao.id por recomendar"),
    filmes: z.array(z.string().regex(/^tt\d+$/)).min(1).optional()
      .describe("IDs do IMDb dos filmes que vão para a tela, na ordem da tela; sem ele, todos os da Recomendação"),
  },
  cli: ({ sessao, filmes }) => ({
    comando: "cartaz",
    args: [`--sessao=${sessao}`, ...(filmes ? [`--filmes=${filmes.join(",")}`] : [])],
  }),
});
