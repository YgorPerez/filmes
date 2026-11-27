import { Effect } from 'effect'
import {
  importImdb,
  importLetterboxdRss,
  importSimkl,
  removeImport,
} from '@filmes/engine'
import { z } from 'zod'
import { defineTool, invalidUsage, ownerAuthor, personName } from '../tool.ts'

export default defineTool({
  name: 'import',
  description:
    'Importa o RSS público do Letterboxd de uma Pessoa (`letterboxdRss`, o usuário dela: as ~50 entradas recentes do ' +
    'diário viram Notas e Já vistos), o CSV de avaliações do IMDb dela (`imdbCsv`, o texto do arquivo "Your Ratings" > ' +
    'Export: cada filme do Catálogo vira Nota e Já visto, a nota de 1 a 10 lida na Escala dela), o backup do Simkl dela ' +
    '(`simklJson`, o texto do SimklBackup.json: filmes e filmes de anime com nota viram Notas, os completed sem nota ' +
    'Já vistos e os plantowatch a watchlist; séries ficam de fora), ou tira um import ' +
    '(`remove`: o registro na Pessoa, o arquivo guardado e os Fatos que só ele trazia). Uma coisa por chamada. O RSS só ' +
    'com o consentimento da própria Pessoa: pergunte a ela, pelo Dono, antes de baixar, e mande `consent: true` só com o ' +
    'sim; sem ele, nada é baixado. O ZIP do Letterboxd e o do Trakt sobem pelo app (Importar), não por aqui; o CSV do ' +
    'IMDb e o backup do Simkl sobem pelos dois. Devolve o relatório: no RSS, a resolução (filmes resolvidos por caminho, descartados, `queue` ' +
    'com os que esperam o Dono em import_queue, Fatos novos); no CSV do IMDb, os Fatos novos e `outsideCatalog` (títulos ' +
    'que o Catálogo não tem, como séries); no backup do Simkl, os Fatos novos, `resolved` e `unresolved` (filmes que ' +
    'nem o ID do IMDb nem o do TMDB acharam no Catálogo); com remove, o import tirado e os Fatos que saíram. Usuário ou arquivo errado ' +
    'é erro com código.',
  input: z.object({
    person: personName(
      'slug, nome ou apelido da Pessoa; com remove, opcional',
    ).optional(),
    letterboxdRss: z
      .string()
      .regex(/^[A-Za-z0-9_]+$/, 'usuário do Letterboxd: letras, dígitos e _')
      .optional()
      .describe('o usuário dela no Letterboxd'),
    imdbCsv: z
      .string()
      .min(1)
      .optional()
      .describe(
        'o texto inteiro do CSV de avaliações do IMDb que a Pessoa mandou',
      ),
    simklJson: z
      .string()
      .min(1)
      .optional()
      .describe(
        'o texto inteiro do SimklBackup.json que a Pessoa mandou (o JSON de dentro do SimklBackup.zip)',
      ),
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
      const asked = [i.letterboxdRss, i.imdbCsv, i.simklJson, i.remove].filter(
        (value) => value !== undefined,
      )
      if (asked.length !== 1)
        return yield* invalidUsage(
          'mande letterboxdRss, imdbCsv, simklJson ou remove, um só',
        )
      if (i.remove !== undefined)
        return yield* removeImport({ file: i.remove, person, author })
      if (i.imdbCsv !== undefined) {
        if (person === undefined)
          return yield* invalidUsage('o CSV do IMDb precisa de person')
        return yield* importImdb({
          person,
          original: `${person}-imdb-ratings.csv`,
          content: new TextEncoder().encode(i.imdbCsv),
          author,
        })
      }
      if (i.simklJson !== undefined) {
        if (person === undefined)
          return yield* invalidUsage('o backup do Simkl precisa de person')
        return yield* importSimkl({
          person,
          original: 'SimklBackup.json',
          content: new TextEncoder().encode(i.simklJson),
          author,
        })
      }
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
