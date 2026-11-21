import { z } from "zod";
import { definirFerramenta } from "../ferramenta.ts";

export default definirFerramenta({
  nome: "fila_import",
  descricao: "Consulta a fila do Letterboxd e registra a decisão do Dono. Use o id devolvido por ver para confirmar ou descartar.",
  entrada: {
    acao: z.enum(["ver", "confirmar", "descartar"]),
    id: z.string().min(1).optional().describe("ID do item devolvido por ver"),
    filme: z.string().trim().min(1).optional().describe("confirmar: tconst ou link do filme no IMDb ou TMDB"),
    razao: z.string().trim().min(1).optional().describe('descartar: ex. "não é filme" ou "ignorar"'),
  },
  cli: (e) => {
    if (e.acao === "ver") return { comando: "fila", args: ["ver"] };
    if (!e.id) throw new Error(`fila ${e.acao} precisa do id do item`);
    if (e.acao === "confirmar") {
      if (!e.filme) throw new Error("fila confirmar precisa de filme");
      return { comando: "fila", args: ["confirmar", `--filme=${e.filme}`, "--", e.id] };
    }
    const razao = e.razao === undefined ? [] : [`--razao=${e.razao}`];
    return { comando: "fila", args: ["descartar", ...razao, "--", e.id] };
  },
});
