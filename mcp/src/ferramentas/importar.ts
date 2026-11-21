import { z } from "zod";
import { definirFerramenta } from "../ferramenta.ts";

export default definirFerramenta({
  nome: "importar",
  descricao: "Importa o ZIP do Letterboxd de uma Pessoa. Devolve a contagem de filmes por caminho de resolução e o que ficou na fila.",
  entrada: {
    pessoa: z.string().trim().min(1).describe("slug, nome ou apelido da Pessoa"),
    letterboxd: z.string().min(1).describe("caminho do ZIP exportado pelo Letterboxd"),
  },
  cli: (e) => ({ comando: "importar", args: [`--pessoa=${e.pessoa}`, `--letterboxd=${e.letterboxd}`] }),
});
