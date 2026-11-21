import { z } from "zod";
import { definirFerramenta } from "../ferramenta.ts";

const pessoa = z.string().regex(/^[^-\s=][^=]*$/, "nome de Pessoa não pode começar com '-' nem espaço, nem ter '='");

const comentario = z
  .string()
  .regex(/\S/, "o comentário não pode ser vazio")
  .optional()
  .describe('o que a Pessoa achou, como foi dito ("enquadramento e diálogo muito bons")');

type Comentado = { pessoa: string; comentario?: string };

const comentarios = (reacoes: Comentado[]) =>
  reacoes.flatMap((r) => (r.comentario !== undefined ? [`--comentario=${r.pessoa}=${r.comentario}`] : []));

export default definirFerramenta({
  nome: "registrar_feedback",
  descricao:
    "Registra o Feedback de uma Sessão aberta e a fecha. Mande `filme` (título ou ID do IMDb, de dentro ou de fora " +
    'da Recomendação) ou `nada: true` ("não vimos nada", sem reação). `notas`: a Nota do Dono ("dono") ou o número ' +
    "que o Dono repassa de outra Pessoa, de 0,5 a 5, ou de 1 a 10 com `escala: 10` (o motor divide por 2 e guarda o " +
    "número dito). `relatos`: a impressão do Dono sobre outra Pessoa. `comentario`, numa Nota ou num Relato, é o que " +
    "a Pessoa achou do filme e vira Declarado específico dela sobre ele, sem Nota nova. Presente " +
    "sem reação fica sem Fato mas ganha o Já visto. Devolve o Filme escolhido, os `fatos` gravados (linhas de " +
    "Evidência com Força e Tipo) e `sem_reacao`. Aceite texto livre. Se faltar alguma reação, " +
    "pergunte só por quem faltou. Mostre o registro e só chame depois da confirmação do Dono.",
  entrada: {
    sessao: z.string().regex(/^[^-\s]/).describe("ID da Sessão, como sessoes_abertas ou recomendar devolvem"),
    filme: z.string().min(1).optional().describe("Filme escolhido: título (pode levar o ano entre parênteses) ou ID"),
    nada: z.boolean().optional().describe('"não vimos nada": fecha sem Filme escolhido'),
    notas: z
      .array(
        z
          .object({
            pessoa,
            nota: z.number(),
            escala: z.literal(10).optional().describe("10 quando a nota foi dada de 1 a 10"),
            comentario,
          })
          .refine((n) => (n.escala === 10 ? n.nota >= 1 && n.nota <= 10 : n.nota >= 0.5 && n.nota <= 5), {
            message: "a Nota vai de 0,5 a 5, ou de 1 a 10 com escala 10",
            path: ["nota"],
          }),
      )
      .optional()
      .describe('Notas: a do Dono (pessoa "dono") e as que ele repassa ("a Ana deu 4,5", "o Leo deu 9 de 10")'),
    relatos: z
      .array(z.object({ pessoa, reacao: z.enum(["gostou", "neutro", "não gostou"]), comentario }))
      .optional()
      .describe('impressão do Dono sobre outra Pessoa ("ela curtiu" é gostou)'),
  },
  cli: ({ sessao, filme, nada, notas = [], relatos = [] }) => ({
    comando: "feedback",
    args: [
      `--sessao=${sessao}`,
      ...(filme !== undefined ? [`--filme=${filme}`] : []),
      ...(nada ? ["--nada"] : []),
      ...notas.map((n) => `--nota=${n.pessoa}=${n.nota}${n.escala === 10 ? "/10" : ""}`),
      ...relatos.map((r) => `--relato=${r.pessoa}=${r.reacao}`),
      ...comentarios([...notas, ...relatos]),
    ],
  }),
});
