import { Effect } from 'effect'
import { filmText } from '../evidence/wording.ts'
import { numOrNull, text } from '../sqlite/row.ts'
import { Sqlite } from '../sqlite/Sqlite.ts'
import {
  TRAKT_REVOKED,
  TraktAccess,
  traktRevokedWarning,
  writeTrakt,
} from '../sources/Trakt.ts'

const FAILED = 'O Feedback foi salvo. O envio ao Trakt falhou.'

const unknownFilm = (film: string) =>
  `O Trakt não encontrou ${film}; ele ficou fora do envio.`

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

/** "Título (ano)" for a warning, or the IMDb id outside the catalogue. */
const filmName = (film: string) =>
  Effect.gen(function* () {
    const sqlite = yield* Sqlite
    const row = yield* sqlite.read((db) =>
      db.get('SELECT titulo, ano FROM filmes WHERE id = ?', film),
    )
    return row ? filmText(text(row, 'titulo'), numOrNull(row, 'ano')) : film
  })

const personName = (person: string) =>
  Effect.gen(function* () {
    const sqlite = yield* Sqlite
    const row = yield* sqlite.read((db) =>
      db.get('SELECT nome FROM pessoas WHERE slug = ?', person),
    )
    return row ? text(row, 'nome') : person
  })

// Only the date is known. Noon UTC keeps the date in the app's time zone
// and gives a stable timestamp when Trakt deduplicates a retried POST.
const timestamp = (date: string) => `${date}T12:00:00.000Z`

type Sent = ReadonlyMap<string, ReadonlyMap<string, Seen>>

/** What a told Session already sent to Trakt, read before a correction
 * replaces its Feedback (#344). */
export const traktSent = (
  session: string,
): Effect.Effect<Sent, never, Sqlite> =>
  seenForTrakt(session).pipe(Effect.orElseSucceed((): Sent => new Map()))

/** What is left to send after `sent`: a film she has not had in the
 * history, and a Nota that is new or changed. Nothing is sent twice or
 * taken back (#344). */
const unsent = (
  seen: Map<string, Seen>,
  before: ReadonlyMap<string, Seen> | undefined,
) => {
  const history = [...seen.values()].filter((s) => !before?.has(s.film))
  const ratings = [...seen.values()].filter(
    (s) => s.rating !== null && before?.get(s.film)?.rating !== s.rating,
  )
  return { history, ratings }
}

/** Called after the Feedback and its commit; returns its warnings. A film
 * Trakt does not know is left out with a warning, and the rest goes. A
 * refused grant warns and skips that Pessoa. A failed source is done for
 * this run. After a correction, `sent` is what the Session had sent, and
 * only the difference goes. */
export const syncTraktFeedback = (session: string, sent: Sent | null = null) =>
  Effect.gen(function* () {
    const connection = yield* TraktAccess
    if (!connection) return [] as ReadonlyArray<string>
    const warnings: string[] = []
    const missing = new Set<string>()
    return yield* Effect.gen(function* () {
      for (const [person, seen] of yield* seenForTrakt(session)) {
        const due =
          sent === null
            ? { history: [...seen.values()], ratings: [...seen.values()] }
            : unsent(seen, sent.get(person))
        if (due.history.length === 0 && due.ratings.length === 0) continue
        const history = due.history.map(({ film, date }) => ({
          ids: { imdb: film },
          watched_at: timestamp(date),
        }))
        if (history.length > 0) {
          const out = yield* writeTrakt('history', history, connection, person)
          if (out === null) continue
          if (out === TRAKT_REVOKED) {
            warnings.push(traktRevokedWarning(yield* personName(person)))
            continue
          }
          for (const film of out) missing.add(film)
        }
        const ratings = due.ratings.flatMap(({ film, date, rating }) =>
          rating === null || missing.has(film)
            ? []
            : [
                {
                  ids: { imdb: film },
                  rating: Math.round(rating * 2),
                  rated_at: timestamp(date),
                },
              ],
        )
        if (ratings.length === 0) continue
        const rated = yield* writeTrakt('ratings', ratings, connection, person)
        if (rated === TRAKT_REVOKED && history.length === 0)
          warnings.push(traktRevokedWarning(yield* personName(person)))
        else if (rated !== null && rated !== TRAKT_REVOKED)
          for (const film of rated) missing.add(film)
      }
      for (const film of missing)
        warnings.push(unknownFilm(yield* filmName(film)))
      return warnings
    }).pipe(
      // Leave room for the Feedback write under the web proxy's timeout.
      Effect.timeoutOrElse({
        duration: '45 seconds',
        orElse: () => Effect.succeed([...warnings, FAILED]),
      }),
      // A bug, not Trakt: logged without the tokens or the request, and the
      // Feedback still answers with the warning.
      Effect.catchDefect((defect) =>
        Effect.logError(
          'Trakt sync defect',
          defect instanceof Error ? `${defect.name}: ${defect.message}` : '',
        ).pipe(Effect.as([...warnings, FAILED])),
      ),
      Effect.orElseSucceed(() => [...warnings, FAILED]),
    )
  })
