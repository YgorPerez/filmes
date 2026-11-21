import { z } from "zod";
import { definirFerramenta } from "../ferramenta.ts";

const pessoa = z.string().regex(/^[^-\s=][^=]*$/, "nome de Pessoa não pode começar com '-' nem espaço, nem ter '='");

export default definirFerramenta({
  nome: "registrar_feedback",
  descricao:
    "Registra o Feedback de uma Sessão aberta e a fecha. Mande `filme` (título ou ID do IMDb, de dentro ou de fora " +
    'da Recomendação) ou `nada: true` ("não vimos nada", sem reação). `notas`: a Nota do Dono ("dono") ou o número ' +
    "que o Dono repassa de outra Pessoa, de 0,5 a 5. `relatos`: a impressão do Dono sobre outra Pessoa. Presente " +
    "sem reação fica sem Fato mas ganha o Já visto. Devolve o Filme escolhido, os `fatos` gravados (linhas de " +
    "Evidência com Força e Tipo) e `sem_reacao`. Só chame depois que o Dono confirmar o registro.",
  entrada: {
    sessao: z.string().regex(/^[^-\s]/).describe("ID da Sessão, como sessoes_abertas ou recomendar devolvem"),
    filme: z.string().min(1).optional().describe("Filme escolhido: título (pode levar o ano entre parênteses) ou ID"),
    nada: z.boolean().optional().describe('"não vimos nada": fecha sem Filme escolhido'),
    notas: z
      .array(z.object({ pessoa, nota: z.number().min(0.5).max(5) }))
      .optional()
      .describe('Notas: a do Dono (pessoa "dono") e as que ele repassa ("a Ana deu 4,5")'),
    relatos: z
      .array(z.object({ pessoa, reacao: z.enum(["gostou", "neutro", "não gostou"]) }))
      .optional()
      .describe('impressão do Dono sobre outra Pessoa ("ela curtiu" é gostou)'),
  },
  cli: ({ sessao, filme, nada, notas = [], relatos = [] }) => ({
    comando: "feedback",
    args: [
      `--sessao=${sessao}`,
      ...(filme !== undefined ? [`--filme=${filme}`] : []),
      ...(nada ? ["--nada"] : []),
      ...notas.map((n) => `--nota=${n.pessoa}=${n.nota}`),
      ...relatos.map((r) => `--relato=${r.pessoa}=${r.reacao}`),
    ],
  }),
});
