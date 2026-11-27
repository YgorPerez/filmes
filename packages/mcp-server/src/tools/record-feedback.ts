import { recordFeedback, REPORT_LEVELS } from '@filmes/engine'
import { z } from 'zod'
import { defineTool, sessionId } from '../tool.ts'

/** Goes before "=" in the engine's `PESSOA=VALOR`. */
const person = z
  .string()
  .regex(
    /^[^-\s=][^=]*$/,
    "nome de Pessoa não pode começar com '-' nem espaço, nem ter '='",
  )

const comment = z
  .string()
  .regex(/\S/, 'o comentário não pode ser vazio')
  .optional()
  .describe(
    'o que a Pessoa achou, como foi dito ("enquadramento e diálogo muito bons")',
  )

export default defineTool({
  name: 'record_feedback',
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    // It also posts the Já vistos and Notas to the Trakt of whoever connected.
    openWorldHint: true,
  },
  session: true,
  description:
    'Registra o Feedback de uma Sessão aberta e a fecha. Mande `film` (título ou ID do IMDb, de dentro ou de fora ' +
    'da Recomendação) ou `nothing: true` ("não vimos nada", sem reação). `ratings`: a Nota do Dono ("dono") ou o número ' +
    'que o Dono repassa de outra Pessoa, de 0,5 a 5, ou de 1 a 10 com `scale: 10` (o motor divide por 2 e guarda o ' +
    'número dito). `reports`: o Relato, a impressão do Dono sobre outra Pessoa. `comment`, numa Nota ou num Relato, é o que ' +
    'a Pessoa achou do filme e vira Declarado específico dela sobre ele, sem Nota nova. Presente ' +
    'sem reação fica sem Fato mas ganha o Já visto. Devolve o Filme escolhido (`chosen`), os `facts` gravados (linhas de ' +
    'Evidência com Força e Tipo) e `withoutReaction`. Aceite texto livre. Se faltar alguma reação, ' +
    'pergunte só por quem faltou. Mostre o registro e só chame depois da confirmação do Dono. Para corrigir uma ' +
    'Sessão já contada, leia o que foi contado (`billboard`) e mande o Feedback inteiro de novo com `correct: true`: ' +
    'ele substitui o anterior, e o Trakt recebe só o que mudou.',
  input: z
    .object({
      session: sessionId(
        'ID da Sessão, como open_sessions ou recommend devolvem',
      ),
      film: z
        .string()
        .min(1)
        .optional()
        .describe(
          'Filme escolhido: título (pode levar o ano entre parênteses) ou ID',
        ),
      nothing: z
        .boolean()
        .optional()
        .describe('"não vimos nada": fecha sem Filme escolhido'),
      correct: z
        .boolean()
        .optional()
        .describe(
          'true para corrigir uma Sessão já contada: o Feedback inteiro substitui o anterior',
        ),
      ratings: z
        .array(
          z
            .object({
              person,
              rating: z.number(),
              scale: z
                .literal(10)
                .optional()
                .describe('10 quando a nota foi dada de 1 a 10'),
              comment,
            })
            .refine(
              (r) =>
                r.scale === 10
                  ? r.rating >= 1 && r.rating <= 10
                  : r.rating >= 0.5 && r.rating <= 5,
              {
                message: 'a Nota vai de 0,5 a 5, ou de 1 a 10 com scale 10',
                path: ['rating'],
              },
            ),
        )
        .optional()
        .describe(
          'Notas: a do Dono (person "dono") e as que ele repassa ("a Ana deu 4,5", "o Leo deu 9 de 10")',
        ),
      reports: z
        .array(
          z.object({
            person,
            reaction: z
              .enum(['liked', 'neutral', 'disliked'])
              .describe(
                'liked (gostou), neutral (neutro) ou disliked (não gostou)',
              ),
            comment,
          }),
        )
        .optional()
        .describe(
          'Relatos: a impressão do Dono sobre outra Pessoa ("ela curtiu" é liked)',
        ),
    })
    .refine((f) => (f.film !== undefined) !== (f.nothing === true), {
      message: 'mande film ou nothing: true, um dos dois',
      path: ['film'],
    }),
  run: ({ session, film, correct, ratings = [], reports = [] }) =>
    recordFeedback({
      session,
      ...(correct === true && { correct }),
      film: film ?? null,
      ratings: ratings.map(
        (r) => `${r.person}=${r.rating}${r.scale === 10 ? '/10' : ''}`,
      ),
      reports: reports.map(
        (r) => `${r.person}=${REPORT_LEVELS[r.reaction].db}`,
      ),
      comments: [...ratings, ...reports].flatMap((r) =>
        r.comment === undefined ? [] : [`${r.person}=${r.comment}`],
      ),
    }),
})
