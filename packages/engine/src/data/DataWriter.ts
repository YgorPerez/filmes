// Every write to filmes-dados goes through here (ADR 0005): the Markdown
// file(s), the derived database's sync and one git commit, all under one
// lock, then a push that may fail and wait.
//
//     const writer = yield* DataWriter
//     yield* writer.write({ author, message: 'veto bruno: terror' }, (db) =>
//       Effect.gen(function* () {
//         yield* savePerson(person)       // the Markdown
//         yield* db.run('INSERT ...')     // the database, same transaction
//       }),
//     )
//
// The lock is `Sqlite.write`'s: one write at a time per process, database
// writes included. Inside it, in order: the work tree must start clean (what
// is left of a write that never committed, e.g. a process killed halfway, is
// set aside in `git stash`, never deleted); the use writes the files and the
// database; `git add -A` and one commit, authored and committed by the
// Pessoa who asked; then SQLite's COMMIT. A use or a commit that fails
// restores the work tree to HEAD (only that write's changes are there) and
// the database rolls back. A commit is never undone: once it exists the
// write counts, pushed or not.
//
// The push runs outside the lock, in a background fiber: kicked by each
// write and once when the engine starts, retried with a growing wait while
// it fails. The queue is the commits ahead of the remote-tracking branch, so
// a restart loses nothing. `status` gives what the admin banner needs.
//
// filmes-dados is committed to only when it is the top of its own git
// repository. Otherwise (the test fixture, a copy of it, the Python
// developer's `tests/fixture/dados` inside this repository) the writer only
// takes the lock: no commit, no push. With `FILMES_DATA_REMOTE` set, a data
// folder that is not a repository is an error.

import { existsSync, realpathSync, statSync } from 'node:fs'
import {
  Clock,
  Context,
  Effect,
  Layer,
  Queue,
  Redacted,
  Ref,
  Semaphore,
} from 'effect'
import type { Person } from '../people/Person.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import { Environment, type EnvironmentShape } from '../runtime/Environment.ts'
import { Sqlite, type Connection, type SqliteError } from '../sqlite/Sqlite.ts'
import { git, GitError, runGit } from './git.ts'

/** Who a commit is by: the logged-in Pessoa, from her frontmatter. */
export interface Author {
  readonly name: string
  readonly email: string
}

/** A Pessoa as a commit's author. One without `email:` signs with an empty
 * one (only a Dono, who has it, logs in). */
export const authorOf = (person: Person): Author => ({
  name: person.name,
  email: person.email ?? '',
})

/** The author of a write no logged-in Pessoa asked for: the command line,
 * a script. */
export const ENGINE_AUTHOR: Author = { name: 'filmes', email: '' }

export interface WriteOptions {
  readonly author: Author
  /** The commit message: what the action was. */
  readonly message: string
}

/** The push queue, as the admin banner shows it. */
export interface PushStatus {
  /** A remote is configured (`FILMES_DATA_REMOTE`) and filmes-dados is a
   * repository: pushes happen. */
  readonly enabled: boolean
  /** Commits not on the remote yet. */
  readonly pending: number
  /** Failed attempts in a row; 0 after a push that worked. */
  readonly failures: number
  /** When the current run of failures began (ISO 8601), or null. */
  readonly failingSince: string | null
  /** What git said on the last failure, without the deploy key's path. */
  readonly lastError: string | null
  /** Pushes keep failing: show the banner to `admin: true` Pessoas. */
  readonly alert: boolean
}

/** Failed attempts in a row before the banner shows. */
export const ALERT_AFTER_FAILURES = 3

/** The wait before retrying a failed push doubles from the first to the
 * last; a write or a restart retries at once. */
const RETRY_FIRST = '1 minute'
const RETRY_LAST_MINUTES = 30

const REMOTE = 'origin'

interface Failures {
  readonly count: number
  readonly since: number | null
  readonly lastError: string | null
}

const NO_FAILURES: Failures = { count: 0, since: null, lastError: null }

/** The data folder as a repository: its path, and whether git is on. */
interface Repo {
  readonly root: string
  readonly git: boolean
}

const identity = (author: Author): Record<string, string> => ({
  GIT_AUTHOR_NAME: author.name,
  GIT_AUTHOR_EMAIL: author.email,
  GIT_COMMITTER_NAME: author.name,
  GIT_COMMITTER_EMAIL: author.email,
})

/** A path as one word of the shell command git runs for ssh. */
const shellQuote = (word: string): string =>
  `'${word.replaceAll("'", `'\\''`)}'`

/** The data folder, and whether it is the top of its own repository. */
const openRepoIn = (
  env: EnvironmentShape,
  remote: string | undefined,
): Effect.Effect<Repo, EngineError> =>
  Effect.gen(function* () {
    const root = yield* env.path('data')
    const isDir = yield* Effect.sync(
      () => existsSync(root) && statSync(root).isDirectory(),
    )
    if (!isDir)
      return yield* engineError(
        'missing_data',
        `repo de dados não encontrado em ${root}`,
      )
    const top = yield* runGit(root, ['rev-parse', '--show-toplevel']).pipe(
      Effect.orElseSucceed(() => undefined),
    )
    const isRepo =
      top !== undefined &&
      top.code === 0 &&
      (yield* Effect.sync(
        () => realpathSync(top.stdout.trim()) === realpathSync(root),
      ))
    if (!isRepo && remote !== undefined)
      return yield* engineError(
        'missing_data',
        `repo de dados em ${root} não é um repositório git, e FILMES_DATA_REMOTE pede o push`,
      )
    return { root, git: isRepo }
  })

const changes = (root: string) =>
  Effect.map(
    git(root, ['status', '--porcelain', '-z', '--untracked-files=all']),
    (out) => out !== '',
  )

/** What a write that never committed left in the work tree goes to
 * `git stash`, so nothing is lost and the tree is clean. */
const setAside = (root: string, author: Author) =>
  Effect.gen(function* () {
    if (!(yield* changes(root))) return
    const now = new Date(yield* Clock.currentTimeMillis).toISOString()
    yield* git(
      root,
      [
        'stash',
        'push',
        '--include-untracked',
        '--quiet',
        '-m',
        `filmes: changes left outside a commit, set aside at ${now}`,
      ],
      identity(author),
    )
  })

/** Back to HEAD: the tree was clean when the write began, so only its
 * changes go. */
const discard = (root: string) =>
  git(root, ['reset', '--quiet', '--hard', 'HEAD']).pipe(
    Effect.andThen(git(root, ['clean', '--quiet', '-d', '--force'])),
    Effect.ignore,
  )

const commit = (root: string, options: WriteOptions) =>
  Effect.gen(function* () {
    yield* git(root, ['add', '--all'])
    const staged = yield* runGit(root, ['diff', '--cached', '--quiet'])
    if (staged.code === 0) return
    yield* git(
      root,
      ['commit', '--quiet', '--no-verify', '-m', options.message],
      identity(options.author),
    )
  })

const scrub = (text: string, keyPath: string | undefined): string => {
  let clean = text.replace(/\/\/[^/@\s]*@/g, '//')
  if (keyPath !== undefined) clean = clean.replaceAll(keyPath, '<chave>')
  return clean
}

const branchOf = (root: string) =>
  Effect.map(git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']), (out) =>
    out.trim(),
  )

const pendingIn = (root: string, branch: string) =>
  Effect.gen(function* () {
    const tracking = `refs/remotes/${REMOTE}/${branch}`
    const known = yield* runGit(root, [
      'rev-parse',
      '--verify',
      '--quiet',
      tracking,
    ])
    const range = known.code === 0 ? `${tracking}..HEAD` : 'HEAD'
    const out = yield* git(root, ['rev-list', '--count', range])
    return Number(out.trim())
  })

/** The remote named `origin` points at `FILMES_DATA_REMOTE`. */
const ensureRemote = (root: string, url: string) =>
  Effect.gen(function* () {
    const current = yield* runGit(root, ['remote', 'get-url', REMOTE])
    if (current.code !== 0) yield* git(root, ['remote', 'add', REMOTE, url])
    else if (current.stdout.trim() !== url)
      yield* git(root, ['remote', 'set-url', REMOTE, url])
  })

const sshEnv = (keyPath: string | undefined): Record<string, string> =>
  keyPath === undefined
    ? {}
    : {
        GIT_SSH_COMMAND: [
          'ssh',
          '-F /dev/null',
          `-i ${shellQuote(keyPath)}`,
          '-o IdentitiesOnly=yes',
          '-o BatchMode=yes',
          '-o StrictHostKeyChecking=accept-new',
          `-o UserKnownHostsFile=${shellQuote(`${keyPath}.known_hosts`)}`,
        ].join(' '),
      }

/** What the push side of the writer shares. */
interface Pushing {
  readonly openRepo: Effect.Effect<Repo, EngineError>
  readonly remote: string | undefined
  readonly keyPath: string | undefined
  readonly failures: Ref.Ref<Failures>
}

const statusWith = (pushing: Pushing, pending: number, enabled: boolean) =>
  Effect.map(Ref.get(pushing.failures), (f): PushStatus => ({
    enabled,
    pending,
    failures: f.count,
    failingSince: f.since === null ? null : new Date(f.since).toISOString(),
    lastError: f.lastError,
    alert: f.count >= ALERT_AFTER_FAILURES,
  }))

const queueStatus = (pushing: Pushing): Effect.Effect<PushStatus> =>
  Effect.gen(function* () {
    if (pushing.remote === undefined)
      return yield* statusWith(pushing, 0, false)
    const repo = yield* pushing.openRepo
    if (!repo.git) return yield* statusWith(pushing, 0, false)
    const branch = yield* branchOf(repo.root)
    return yield* statusWith(pushing, yield* pendingIn(repo.root, branch), true)
  }).pipe(
    Effect.catch((error) =>
      Effect.flatMap(Ref.get(pushing.failures), (f) =>
        statusWith(pushing, 0, true).pipe(
          Effect.map((s) => ({
            ...s,
            lastError: f.lastError ?? scrub(error.message, pushing.keyPath),
          })),
        ),
      ),
    ),
  )

const failed = (pushing: Pushing, message: string) =>
  Effect.flatMap(Clock.currentTimeMillis, (now) =>
    Ref.update(pushing.failures, (f) => ({
      count: f.count + 1,
      since: f.since ?? now,
      lastError: scrub(message, pushing.keyPath),
    })),
  )

const attempt = (pushing: Pushing, url: string) =>
  Effect.gen(function* () {
    const repo = yield* pushing.openRepo
    const branch = yield* branchOf(repo.root)
    if ((yield* pendingIn(repo.root, branch)) === 0) return
    yield* ensureRemote(repo.root, url)
    yield* git(
      repo.root,
      ['push', '--quiet', REMOTE, `HEAD:refs/heads/${branch}`],
      sshEnv(pushing.keyPath),
    )
  })

const pushWith = (
  pushing: Pushing,
  pushLock: Semaphore.Semaphore,
): Effect.Effect<PushStatus> =>
  pushing.remote === undefined
    ? statusWith(pushing, 0, false)
    : pushLock.withPermits(1)(
        attempt(pushing, pushing.remote).pipe(
          Effect.matchEffect({
            onFailure: (error) => failed(pushing, error.message),
            onSuccess: () => Ref.set(pushing.failures, NO_FAILURES),
          }),
          Effect.andThen(queueStatus(pushing)),
        ),
      )

/** Waits for a kick, then pushes until the queue is empty, waiting longer
 * after each failure; a kick cuts the wait short. */
const drain = (kicks: Queue.Queue<void>, push: Effect.Effect<PushStatus>) =>
  Effect.gen(function* () {
    yield* Queue.take(kicks)
    let wait = 1
    for (;;) {
      const after = yield* push
      if (after.pending === 0 || after.failures === 0) return
      yield* Queue.take(kicks).pipe(
        Effect.timeoutOption(wait === 1 ? RETRY_FIRST : `${wait} minutes`),
      )
      wait = Math.min(wait * 2, RETRY_LAST_MINUTES)
    }
  })

/** Inside the lock: the use, then one commit of what it changed. */
const committed = <A, E, R>(
  openRepo: Effect.Effect<Repo, EngineError>,
  options: WriteOptions,
  use: Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const repo = yield* openRepo
    if (!repo.git) return yield* use
    yield* setAside(repo.root, options.author)
    return yield* use.pipe(
      Effect.tap(() => commit(repo.root, options)),
      Effect.onError(() => discard(repo.root)),
    )
  })

export class DataWriter extends Context.Service<
  DataWriter,
  {
    /** Runs `use` under the write lock, then commits what it changed in
     * filmes-dados, and queues the push. */
    readonly write: <A, E, R>(
      options: WriteOptions,
      use: (db: Connection) => Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E | EngineError | SqliteError | GitError, R>
    /** As `write`, for files the derived database only mirrors (a
     * Pessoa): without a database file, `use` gets null and only the files
     * are written and committed, as Python's `sincronizar` skips a missing
     * database. */
    readonly writeFiles: <A, E, R>(
      options: WriteOptions,
      use: (db: Connection | null) => Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E | EngineError | SqliteError | GitError, R>
    /** Pushes what is queued, now, after any push already running. A
     * failure is recorded in the status, not returned. */
    readonly push: Effect.Effect<PushStatus>
    /** The queue as it is. */
    readonly status: Effect.Effect<PushStatus>
  }
>()('@filmes/engine/data/DataWriter') {
  static readonly layer: Layer.Layer<DataWriter, never, Environment | Sqlite> =
    Layer.effect(
      DataWriter,
      Effect.gen(function* () {
        const env = yield* Environment
        const sqlite = yield* Sqlite
        const remote = env.dataRemote
        const pushing: Pushing = {
          openRepo: openRepoIn(env, remote),
          remote,
          keyPath:
            env.dataKey === undefined ? undefined : Redacted.value(env.dataKey),
          failures: yield* Ref.make<Failures>(NO_FAILURES),
        }
        const pushLock = yield* Semaphore.make(1)
        const kicks = yield* Queue.sliding<void>(1)
        const push = pushWith(pushing, pushLock)
        const kick = Queue.offer(kicks, undefined)

        if (remote !== undefined) {
          yield* Effect.forkScoped(Effect.forever(drain(kicks, push)))
          yield* kick
        }

        return DataWriter.of({
          write: (options, use) =>
            sqlite
              .write((db) => committed(pushing.openRepo, options, use(db)))
              .pipe(Effect.tap(() => kick)),
          writeFiles: (options, use) =>
            Effect.gen(function* () {
              const database = yield* env.path('database')
              if (yield* Effect.sync(() => existsSync(database)))
                return yield* sqlite.write((db) =>
                  committed(pushing.openRepo, options, use(db)),
                )
              return yield* sqlite.exclusive(
                committed(pushing.openRepo, options, use(null)),
              )
            }).pipe(Effect.tap(() => kick)),
          push,
          status: queueStatus(pushing),
        })
      }),
    )
}

/** The push queue now, for an edge that shows it (the admin's Operações
 * screen and banner). */
export const pushStatus: Effect.Effect<PushStatus, never, DataWriter> =
  Effect.gen(function* () {
    return yield* (yield* DataWriter).status
  })

/** A push attempt now, after any one already running ("tentar de novo"). */
export const pushNow: Effect.Effect<PushStatus, never, DataWriter> = Effect.gen(
  function* () {
    return yield* (yield* DataWriter).push
  },
)
