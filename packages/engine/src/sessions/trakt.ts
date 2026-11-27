import { Effect } from 'effect'
import { numOrNull, text } from '../sqlite/row.ts'
import { Sqlite } from '../sqlite/Sqlite.ts'
import { TraktAccess, writeTrakt } from '../sources/Trakt.ts'

const WARNING = 'O Feedback foi salvo. O envio ao Trakt falhou.'

interface Seen {
  readonly film: string
  readonly date: string
  readonly rating: number | null
}

/** The persisted Já vi marks live in the Pessoas' Fatos, including marks
 * from earlier versions of the Cartaz. The chosen film uses the Session date. */
const seenForTrakt = (session: string) =>
  Effect.gen(function* () {
    const sqlite = yield* Sqlite
    const rows = yield* sqlite.read((db) =>
      db.all(
        `SELECT v.pessoa AS pessoa, v.filme_id AS filme_id, v.data AS data, n.nota
         FROM ja_vistos v LEFT JOIN notas n ON n.fato_id = v.fato_id
         WHERE v.fonte = ? AND v.tipo IN ('nota', 'declarado') AND v.filme_id GLOB 'tt[0-9]*'
         UNION ALL
         SELECT p.pessoa, s.escolhido, s.data, r.nota
         FROM sessoes s JOIN sessao_presentes p ON p.sessao = s.id
         LEFT JOIN reacoes r ON r.sessao = s.id AND r.pessoa = p.pessoa
         WHERE s.id = ? AND s.escolhido IS NOT NULL
         ORDER BY pessoa, filme_id, data`,
        `cartaz ${session}`,
        session,
      ),
    )
    const people = new Map<string, Map<string, Seen>>()
    for (const row of rows) {
      const person = text(row, 'pessoa')
      const film = text(row, 'filme_id')
      if (!/^tt\d+$/.test(film)) continue
      const films = people.get(person) ?? new Map<string, Seen>()
      const rating = numOrNull(row, 'nota') ?? films.get(film)?.rating ?? null
      films.set(film, { film, date: text(row, 'data'), rating })
      people.set(person, films)
    }
    return people
  })

// Only the date is known. Noon UTC keeps the date in the app's time zone
// and gives a stable timestamp when Trakt deduplicates a retried POST.
const timestamp = (date: string) => `${date}T12:00:00.000Z`

/** Called after the Feedback and its commit. A failed source is done for this run. */
export const syncTraktFeedback = (session: string) =>
  Effect.gen(function* () {
    const connection = yield* TraktAccess
    if (!connection) return
    return yield* Effect.gen(function* () {
      for (const [person, seen] of yield* seenForTrakt(session)) {
        const history = [...seen.values()].map(({ film, date }) => ({
          ids: { imdb: film },
          watched_at: timestamp(date),
        }))
        const sent = yield* writeTrakt('history', history, connection, person)
        if (!sent) continue
        const ratings = [...seen.values()].flatMap(({ film, date, rating }) =>
          rating === null
            ? []
            : [
                {
                  ids: { imdb: film },
                  rating: Math.round(rating * 2),
                  rated_at: timestamp(date),
                },
              ],
        )
        if (ratings.length > 0)
          yield* writeTrakt('ratings', ratings, connection, person)
      }
    }).pipe(
      Effect.as(undefined),
      // Leave room for the Feedback write under the web proxy's timeout.
      Effect.timeoutOrElse({
        duration: '45 seconds',
        orElse: () => Effect.succeed(WARNING),
      }),
      Effect.catchCause(() => Effect.succeed(WARNING)),
    )
  })
