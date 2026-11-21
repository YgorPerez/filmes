import { z } from "zod";
import { definirFerramenta } from "../ferramenta.ts";

export default definirFerramenta({
  nome: "importar",
  descricao: "Importa o ZIP de uma Pessoa. Informe uma origem por vez, Letterboxd ou Trakt. Devolve o relatório de resolução.",
  entrada: {
    pessoa: z.string().trim().min(1).describe("slug, nome ou apelido da Pessoa"),
    letterboxd: z.string().min(1).optional().describe("caminho do ZIP exportado pelo Letterboxd"),
    trakt: z.string().min(1).optional().describe("caminho do ZIP do Raw Export do Trakt"),
  },
  cli: (e) => ({
    comando: "importar",
    args: [
      `--pessoa=${e.pessoa}`,
      ...(e.letterboxd ? [`--letterboxd=${e.letterboxd}`] : []),
      ...(e.trakt ? [`--trakt=${e.trakt}`] : []),
    ],
  }),
});
