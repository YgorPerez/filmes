import { z } from "zod";
import { definirFerramenta } from "../ferramenta.ts";

export default definirFerramenta({
  nome: "importar",
  descricao: "Importa o ZIP do Letterboxd ou do Trakt, ou o RSS público do Letterboxd, de uma Pessoa. Informe uma origem por vez. O RSS só com o consentimento da Pessoa. Devolve o relatório de resolução.",
  entrada: {
    pessoa: z.string().trim().min(1).describe("slug, nome ou apelido da Pessoa"),
    letterboxd: z.string().min(1).optional().describe("caminho do ZIP exportado pelo Letterboxd"),
    letterboxd_rss: z.string().regex(/^[A-Za-z0-9_]+$/).optional()
      .describe("usuário do Letterboxd: baixa o RSS público com as ~50 entradas recentes do diário"),
    trakt: z.string().min(1).optional().describe("caminho do ZIP do Raw Export do Trakt"),
  },
  cli: (e) => ({
    comando: "importar",
    args: [
      `--pessoa=${e.pessoa}`,
      ...(e.letterboxd ? [`--letterboxd=${e.letterboxd}`] : []),
      ...(e.letterboxd_rss ? [`--letterboxd-rss=${e.letterboxd_rss}`] : []),
      ...(e.trakt ? [`--trakt=${e.trakt}`] : []),
    ],
  }),
});
