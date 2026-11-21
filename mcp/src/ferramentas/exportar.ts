import { z } from "zod";
import { definirFerramenta } from "../ferramenta.ts";

export default definirFerramenta({
  nome: "exportar",
  descricao:
    "Grava as Notas de uma Pessoa num arquivo de outro serviço. formato imdb: o CSV de avaliações do IMDb " +
    "(Nota vigente de cada filme, dobrada para 1 a 10), o único que o import do MovieLens aceita " +
    "(movielens.org, Import or Export Data). Devolve o caminho, quantas Notas saíram e quantas são de filme fora do Catálogo.",
  entrada: {
    pessoa: z.string().trim().min(1).describe("slug, nome ou apelido da Pessoa"),
    formato: z.enum(["imdb"]).describe("imdb: CSV de avaliações do IMDb, para importar no MovieLens"),
    saida: z.string().min(1).describe("caminho do .csv a gravar; fora do repo de código"),
  },
  cli: (e) => ({
    comando: "exportar",
    args: [`--pessoa=${e.pessoa}`, `--formato=${e.formato}`, `--saida=${e.saida}`],
  }),
});
