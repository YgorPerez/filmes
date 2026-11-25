import { Effect } from 'effect'
import {
  confirmQueueItem,
  discardQueueItem,
  reprocessLetterboxd,
  viewQueue,
} from '@filmes/engine'
import { z } from 'zod'
import {
  defineTool,
  invalidUsage,
  ownerAuthor,
  personName,
} from '../tool.ts'

/** The reason `discard` records when none is given, as the CLI's. */
const IGNORE = 'ignorar'

export default defineTool({
  name: 'import_queue',
  description:
    'A fila do Letterboxd: os filmes de um import que o motor não resolveu sozinho esperam a decisão do Dono. ' +
    'view: os itens (id, nome, ano, por que estão na fila, de quem) com os candidatos que o TMDB já deu. ' +
    'confirm: o item é este filme (`film`: tconst, link do IMDb ou do TMDB). discard: não entra (`reason`, ex. ' +
    '"não é filme"; padrão "ignorar"). reprocess: pergunta de novo ao TMDB pelos itens que ele não respondeu no import, ' +
    'de uma Pessoa ou de todas. A decisão vale para todas as Pessoas com o mesmo filme e é um commit em nome do Dono. ' +
    'Mostre os candidatos e só confirme com o sim do Dono.',
  input: z.object({
    action: z
      .enum(['view', 'confirm', 'discard', 'reprocess'])
      .describe('view, confirm, discard ou reprocess'),
    id: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('confirm, discard: o id do item, como view devolve'),
    film: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('confirm: tconst ou link do filme no IMDb ou no TMDB'),
    reason: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('discard: por que não entra'),
    person: personName(
      'reprocess: slug, nome ou apelido da Pessoa; sem ela, todas',
    ).optional(),
  }),
  run: (i) =>
    Effect.gen(function* () {
      if (i.action === 'view') return yield* viewQueue
      const author = yield* ownerAuthor
      if (i.action === 'reprocess')
        return yield* reprocessLetterboxd({
          person:
            i.person,
          author,
        })
      if (i.id === undefined)
        return yield* invalidUsage(`import_queue ${i.action} precisa de id`)
      if (i.action === 'discard')
        return yield* discardQueueItem({
          id: i.id,
          reason: i.reason ?? IGNORE,
          author,
        })
      if (i.film === undefined)
        return yield* invalidUsage('import_queue confirm precisa de film')
      return yield* confirmQueueItem({ id: i.id, film: i.film, author })
    }),
})
