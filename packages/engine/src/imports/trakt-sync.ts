// A Pessoa's Trakt read by the API (#269): her own account through the
// connection the app keeps (OAuth with PKCE, #279), or any public profile by
// its username with the client id alone. The lists come in the shape of the
// Raw Export's JSONs, so they are kept in filmes-dados as one snapshot
// (`imports/<slug>/trakt-api-<sha>.json`) and load as the ZIPs do
// (`trakt.ts`): the Fatos keep their `trakt:` ids, and the same play
// imported from a ZIP and from the API is one Fato. Each snapshot holds the
// whole profile, so a new one replaces the one before.
//
// It runs from the import page ("Sincronizar agora", or a username) and when
// a new Session opens, for each Presente with a connection or a username
// (`syncAttendeesTrakt`).
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { Effect, Option, Result } from 'effect'
import { DataWriter, type Author } from '../data/DataWriter.ts'
import type { GitError } from '../data/git.ts'
import { isMapping, pyStrValue } from '../data/yaml.ts'
import { resolvePerson, savePerson } from '../people/people.ts'
import type { Person } from '../people/Person.ts'
import {
  TRAKT_ATTRIBUTION,
  type Attribution,
} from '../recommendation/attributions.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import { Environment } from '../runtime/Environment.ts'
import type { Run } from '../runtime/Run.ts'
import type { Sqlite, SqliteError } from '../sqlite/Sqlite.ts'
import {
  readTraktLists,
  TRAKT_REVOKED,
  TraktAccess,
  traktRevokedWarning,
  type TraktConnection,
} from '../sources/Trakt.ts'
import type { Transport } from '../sources/Source.ts'
import { storeImport } from './stored.ts'
import {
  loadPersonTrakt,
  personTraktRows,
  requireImportTables,
  TRAKT_API_KIND,
  traktFactCounts,
  type TraktFactCounts,
  type TraktReport,
} from './trakt.ts'

/** A Trakt username as its profile's address has it. */
const TRAKT_USER = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/

/** The original name a snapshot of the connected account records. */
const CONNECTED = 'conta conectada'

/** The public username her latest snapshot read, or null (none, or her
 * connected account). */
export const linkedTraktUser = (person: Person): string | null => {
  const latest = person.imports
    .filter(isMapping)
    .filter((record) => record.get('kind') === TRAKT_API_KIND)
    .at(-1)
  const original =
    latest === undefined ? '' : pyStrValue(latest.get('original') ?? null)
  return original.startsWith('@') ? original.slice(1) : null
}

export interface TraktSyncInput {
  /** Slug, name or alias; "dono" is the Dono. */
  readonly person: string
  /** A public username to read; without it, her connected account, or the
   * username she was linked to before. */
  readonly user?: string | undefined
  /** Who asked: the commit's author. */
  readonly author: Author
}

export interface TraktSync extends TraktReport {
  readonly person: string
  /** `me` (her connected account) or the username read. */
  readonly user: string
  /** The kept snapshot, relative to filmes-dados. */
  readonly file: string
  /** False when the profile had not changed since the last read. */
  readonly newFile: boolean
  readonly facts: TraktFactCounts
  readonly newFacts: TraktFactCounts
  readonly attributions: readonly Attribution[]
  /** Trakt refused her grant: read by her username, she must reconnect. */
  readonly warnings?: readonly string[]
}

type Token = string | null | typeof TRAKT_REVOKED

/** Her connection's token: null when she has none or it failed, or
 * `TRAKT_REVOKED` when Trakt refused to refresh it. The app drops a refused
 * grant, so the next ask finds her not connected: ask once per read. */
const tokenOf = (connection: TraktConnection, person: string) =>
  Effect.tryPromise({
    try: (signal): Promise<Token> => connection.accessToken(person, signal),
    catch: () => null,
  }).pipe(Effect.orElseSucceed((): Token => null))

/** The Pessoa without her snapshots older than `kept`, their files gone. */
const dropOlderSnapshots = (person: Person, kept: string) =>
  Effect.gen(function* () {
    const root = yield* (yield* Environment).path('data')
    const old = person.imports
      .filter(isMapping)
      .filter(
        (record) =>
          record.get('kind') === TRAKT_API_KIND &&
          pyStrValue(record.get('file') ?? null) !== kept,
      )
    if (old.length === 0) return person
    const updated: Person = {
      ...person,
      imports: person.imports.filter(
        (record) => !old.includes(record as never),
      ),
    }
    yield* savePerson(updated)
    yield* Effect.sync(() => {
      for (const record of old)
        rmSync(join(root, pyStrValue(record.get('file') ?? null)), {
          force: true,
        })
    })
    return updated
  })

/** Reads her Trakt by `user`, or with `token`, or by the username she was
 * linked to, and keeps it. */
const readTrakt = (
  connection: TraktConnection,
  person: Person,
  input: {
    readonly user: string | undefined
    readonly token: string | null
    readonly author: Author
    /** Why she cannot be read, when nothing links her. */
    readonly unlinked?: string
  },
) =>
  Effect.gen(function* () {
    const { token } = input
    const user = input.user ?? (token !== null ? 'me' : linkedTraktUser(person))
    if (user === null)
      return yield* engineError(
        'invalid_usage',
        input.unlinked ??
          `${person.name} não conectou o Trakt nem tem um usuário do Trakt`,
        'trakt_not_linked',
      )
    if (user !== 'me' && !TRAKT_USER.test(user))
      return yield* engineError(
        'invalid_usage',
        `${JSON.stringify(user)} não é um usuário do Trakt`,
        'trakt_user_missing',
      )
    const lists = yield* readTraktLists(user, connection.clientId, token).pipe(
      Effect.catchTag('SourceFailure', (failure) =>
        Effect.fail(
          engineError(
            'source_unavailable',
            `o Trakt não respondeu (${failure.reason})`,
          ),
        ),
      ),
    )
    if (lists === 'missing')
      return yield* engineError(
        'invalid_usage',
        `o Trakt não tem o usuário ${user}`,
        'trakt_user_missing',
      )
    if (lists === 'private')
      return yield* engineError(
        'source_unavailable',
        `o perfil ${user} do Trakt é privado`,
        'trakt_private',
      )
    const content = Buffer.from(`${JSON.stringify({ user, ...lists })}\n`)
    const writer = yield* DataWriter
    return yield* writer.write(
      { author: input.author, message: `sync trakt ${person.slug}: ${user}` },
      (db) =>
        Effect.gen(function* () {
          yield* requireImportTables(db)
          const before = yield* traktFactCounts(db, person.slug)
          const kept = yield* storeImport(
            person,
            TRAKT_API_KIND,
            user === 'me' ? CONNECTED : `@${user}`,
            content,
            'json',
          )
          const current = yield* dropOlderSnapshots(kept.person, kept.file)
          const report = yield* loadPersonTrakt(
            db,
            current,
            yield* personTraktRows(current),
          )
          const after = yield* traktFactCounts(db, person.slug)
          const done: TraktSync = {
            ...report,
            person: person.slug,
            user,
            file: kept.file,
            newFile: kept.new,
            facts: after,
            newFacts: {
              ratings: after.ratings - before.ratings,
              seen: after.seen - before.seen,
              watchlist: after.watchlist - before.watchlist,
            },
            attributions: [TRAKT_ATTRIBUTION],
          }
          return done
        }),
    )
  })

/** Reads the Pessoa's Trakt and keeps it (`sincronizar agora`). */
export const syncTrakt = (
  input: TraktSyncInput,
): Effect.Effect<
  TraktSync,
  EngineError | SqliteError | GitError,
  Environment | Sqlite | Run | DataWriter | Transport
> =>
  Effect.gen(function* () {
    const connection = yield* TraktAccess
    if (connection === null)
      return yield* engineError(
        'source_unavailable',
        'o Trakt não está configurado neste servidor (FILMES_TRAKT_CLIENT_ID)',
        'trakt_off',
      )
    const person = yield* resolvePerson(input.person)
    const typed = input.user?.trim().replace(/^@/, '') || undefined
    const token =
      typed === undefined ? yield* tokenOf(connection, person.slug) : null
    if (token !== TRAKT_REVOKED)
      return yield* readTrakt(connection, person, {
        user: typed,
        token,
        author: input.author,
      })
    // Refused: her username, if she has one, and a warning; without one,
    // the refusal says it.
    const warning = traktRevokedWarning(person.name)
    const read = yield* readTrakt(connection, person, {
      user: undefined,
      token: null,
      author: input.author,
      unlinked: warning,
    })
    return { ...read, warnings: [warning] }
  })

const SESSION_WARNING = (name: string) =>
  `Não deu para atualizar o Trakt de ${name}; a Sessão usa o que já estava.`

/** Before a new Session (#269): reads the Trakt of each Presente who
 * connected hers or has a username, so what she watched yesterday is a
 * Já visto today. A failure is a warning, never a failed Session; a server
 * without Trakt does nothing. */
export const syncAttendeesTrakt = (
  attendees: ReadonlyArray<string>,
  author: Author,
): Effect.Effect<
  string[],
  never,
  Environment | Sqlite | Run | DataWriter | Transport
> =>
  Effect.gen(function* () {
    const connection = yield* TraktAccess
    if (connection === null) return []
    const warnings: string[] = []
    for (const name of attendees) {
      const person = yield* Effect.option(resolvePerson(name))
      if (Option.isNone(person)) continue
      const token = yield* tokenOf(connection, person.value.slug)
      if (token === TRAKT_REVOKED)
        warnings.push(traktRevokedWarning(person.value.name))
      const bearer = token === TRAKT_REVOKED ? null : token
      if (bearer === null && linkedTraktUser(person.value) === null) continue
      const synced = yield* Effect.result(
        readTrakt(connection, person.value, {
          user: undefined,
          token: bearer,
          author,
        }).pipe(
          Effect.timeoutOrElse({
            duration: '20 seconds',
            orElse: () =>
              Effect.fail(engineError('source_unavailable', 'timeout')),
          }),
        ),
      )
      if (Result.isFailure(synced))
        warnings.push(SESSION_WARNING(person.value.name))
    }
    return warnings
  })
