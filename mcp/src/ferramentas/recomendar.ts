import { z } from "zod";
import { definirFerramenta } from "../ferramenta.ts";

const pessoa = z.string().regex(/^[^-\s]/, "nome de Pessoa não pode começar com '-' nem espaço");

export default definirFerramenta({
  nome: "recomendar",
  descricao:
    "Recomendação para uma Sessão: devolve o top 5 com as Evidências de cada filme " +
    "(pessoa, texto, fonte, data, forca, tipo, fato_id, contribuicao) e os Vetos que agiram (vetos). " +
    'Presentes por slug, nome ou apelido; "dono" é o Dono.',
  entrada: {
    presentes: z.array(pessoa).min(1).describe('Pessoas da Sessão, ex.: ["dono", "ana"]'),
    quantos: z.number().int().min(1).max(100).optional().describe("tamanho da lista; padrão 5"),
  },
  cli: ({ presentes, quantos }) => ({
    comando: "recomendar",
    args: ["--presentes", ...presentes, ...(quantos ? ["--quantos", String(quantos)] : [])],
  }),
});
