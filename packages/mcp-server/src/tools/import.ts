import { Effect } from 'effect'
import { importLetterboxdRss, removeImport } from '@filmes/engine'
import { z } from 'zod'
import { defineTool, invalidUsage, ownerAuthor, personName } from '../tool.ts'

export default defineTool({
  name: 'import',
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: true,
  },
  description:
    'Importa o RSS público do Letterboxd de uma Pessoa (`letterboxdRss`, o usuário dela: as ~50 entradas recentes do ' +
    'diário viram Notas e Já vistos), ou tira um import (`remove`: o registro na Pessoa, o arquivo guardado e os Fatos ' +
    'que só ele trazia). Uma coisa por chamada. O RSS só com o consentimento da própria Pessoa: pergunte a ela, pelo ' +
    'Dono, antes de baixar, e mande `consent: true` só com o sim; sem ele, nada é baixado. O ZIP do Letterboxd e o do ' +
    'Trakt sobem pelo app (Importar), não por aqui. Devolve o relatório de resolução (filmes resolvidos por caminho, ' +
    'descartados, `queue` com os que esperam o Dono em import_queue, Fatos novos); com remove, o import tirado e os Fatos ' +
    'que saíram. Usuário ou arquivo errado é erro com código.',
  input: z.object({
    person: personName(
      'slug, nome ou apelido da Pessoa; com remove, opcional',
    ).optional(),
    letterboxdRss: z
      .string()
      .regex(/^[A-Za-z0-9_]+$/, 'usuário do Letterboxd: letras, dígitos e _')
      .optional()
      .describe('o usuário dela no Letterboxd'),
    consent: z
      .literal(true)
      .optional()
      .describe('letterboxdRss: a Pessoa disse sim a baixar o RSS dela'),
    remove: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        'o arquivo do import, como person view mostra em imports (imports/<pessoa>/...), ou só o nome dele',
      ),
  }),
  run: (i) =>
    Effect.gen(function* () {
      const author = yield* ownerAuthor
      const { person } = i
      if ((i.letterboxdRss === undefined) === (i.remove === undefined))
        return yield* invalidUsage('mande letterboxdRss ou remove, um dos dois')
      if (i.remove !== undefined)
        return yield* removeImport({ file: i.remove, person, author })
      if (person === undefined)
        return yield* invalidUsage('o RSS precisa de person')
      if (i.consent !== true)
        return yield* invalidUsage(
          'o RSS só com o consentimento da Pessoa: pergunte e mande consent: true',
        )
      return yield* importLetterboxdRss({
        person,
        user: i.letterboxdRss!,
        author,
      })
    }),
})
