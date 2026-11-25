// DataWriter over a scratch filmes-dados: the fixture's data made a git
// repository with a bare remote beside it, both in the test's folder. No
// network: the remote is a local path, and the ssh test puts a fake `ssh`
// first on PATH.

import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'
import { describe, expect, test, vi } from 'vite-plus/test'
import {
  addItem,
  ALERT_AFTER_FAILURES,
  authorOf,
  DataWriter,
  engineError,
  makeEngine,
  personCreate,
  personSkip,
  personVeto,
  resolvePerson,
  savePerson,
  Sqlite,
  type Author,
  type Connection,
  type EngineServices,
  type Outcome,
  type Run,
  type Vars,
  type WriteOptions,
  pushNow,
  pushStatus,
} from '../src/index.ts'
import { useFixture, type Fixture } from './fixture.ts'

const BRUNO: Author = { name: 'Bruno', email: 'bruno@example.org' }
const IARA: Author = { name: 'Iara', email: 'iara@example.org' }

/** git with none of the caller's `GIT_*` (a hook's `GIT_DIR` would point
 * at this repository). */
const gitIn = (cwd: string, ...args: string[]): string => {
  const env: Record<string, string | undefined> = {}
  for (const [name, value] of Object.entries(process.env))
    if (!name.startsWith('GIT_')) env[name] = value
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...env,
      GIT_AUTHOR_NAME: 'Setup',
      GIT_AUTHOR_EMAIL: 'setup@example.org',
      GIT_COMMITTER_NAME: 'Setup',
      GIT_COMMITTER_EMAIL: 'setup@example.org',
      GIT_CONFIG_NOSYSTEM: '1',
    },
  })
}

interface Scratch {
  readonly fixture: Fixture
  readonly remote: string
  readonly vars: Vars
  /** `git log` of a repository: `author <email>|subject`, newest first. */
  readonly log: (repo: string, range?: string) => string[]
}

/** The fixture's data as a repository with one commit, pushed to a bare
 * remote. */
const useScratchRepo = (): Scratch => {
  const fixture = useFixture()
  const remote = join(fixture.root, 'remote.git')
  gitIn(fixture.root, 'init', '--quiet', '--bare', '-b', 'master', remote)
  gitIn(fixture.data, 'init', '--quiet', '-b', 'master')
  gitIn(fixture.data, 'add', '--all')
  gitIn(fixture.data, 'commit', '--quiet', '-m', 'initial')
  gitIn(fixture.data, 'remote', 'add', 'origin', remote)
  gitIn(fixture.data, 'push', '--quiet', '-u', 'origin', 'master')
  return {
    fixture,
    remote,
    vars: { ...fixture.vars, FILMES_DATA_REMOTE: remote },
    log: (repo, range = 'master') =>
      gitIn(repo, 'log', '--format=%an <%ae>|%cn <%ce>|%s', range)
        .trim()
        .split('\n'),
  }
}

const write = <A, E, R>(
  options: WriteOptions,
  use: (db: Connection) => Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const writer = yield* DataWriter
    return yield* writer.write(options, use)
  })

const scratchRows = Effect.gen(function* () {
  const sqlite = yield* Sqlite
  return yield* sqlite.read((db) => db.all('SELECT x FROM scratch'))
})

/** A use that writes one file in filmes-dados. */
const writeFile = (data: string, name: string, text: string) =>
  Effect.sync(() => writeFileSync(join(data, name), text))

/** One engine for several requests, closed at the end. */
const withEngine = async <A>(
  vars: Vars,
  body: (engine: ReturnType<typeof makeEngine>) => Promise<A>,
): Promise<A> => {
  const engine = makeEngine(vars)
  try {
    return await body(engine)
  } finally {
    await engine.dispose()
  }
}

const ok = async <A>(promise: Promise<Outcome<A>>): Promise<A> => {
  const outcome = await promise
  if (outcome.exitCode !== 0)
    throw new Error(`expected success, got ${JSON.stringify(outcome)}`)
  return outcome.output
}

describe('write', () => {
  test('makes one commit by the Pessoa, with the Markdown and the database in step', async () => {
    const { fixture, vars, log, remote } = useScratchRepo()

    await withEngine(vars, async (engine) => {
      await ok(
        engine.run(
          Effect.gen(function* () {
            const bruno = yield* resolvePerson('bruno')
            const { person } = yield* addItem(bruno, 'vetoes', {
              text: 'nada de terror',
              target: 'terror',
              label: 'terror',
              date: '2026-11-20',
            })
            return yield* write(
              { author: authorOf(bruno), message: 'veto bruno: terror' },
              (db) =>
                Effect.gen(function* () {
                  yield* savePerson(person)
                  yield* db.exec('CREATE TABLE scratch (x)')
                  yield* db.run("INSERT INTO scratch VALUES ('veto')")
                }),
            )
          }),
        ),
      )
      const after = await ok(engine.run(pushNow))
      expect(after).toMatchObject({ enabled: true, pending: 0, failures: 0 })
    })

    const commits = log(fixture.data)
    expect(commits).toEqual([
      'Bruno <bruno@example.org>|Bruno <bruno@example.org>|veto bruno: terror',
      'Setup <setup@example.org>|Setup <setup@example.org>|initial',
    ])
    expect(
      gitIn(fixture.data, 'show', '--name-only', '--format=', 'HEAD'),
    ).toBe('people/bruno.md\n')
    expect(gitIn(fixture.data, 'status', '--porcelain')).toBe('')
    expect(log(remote)).toEqual(commits)
    expect(await fixture.ok(scratchRows)).toEqual([{ x: 'veto' }])
  })

  test('a write that changes nothing makes no commit', async () => {
    const { fixture, vars, log } = useScratchRepo()

    await ok(
      makeEngineRun(
        vars,
        write({ author: BRUNO, message: 'nothing' }, () => Effect.void),
      ),
    )

    expect(log(fixture.data)).toHaveLength(1)
  })

  test('a use that fails leaves no commit, no file and no row', async () => {
    const { fixture, vars, log } = useScratchRepo()
    const person = join(fixture.data, 'people', 'bruno.md')
    const before = readFileSync(person, 'utf8')

    const outcome = await makeEngineRun(
      vars,
      write({ author: BRUNO, message: 'broken' }, (db) =>
        Effect.gen(function* () {
          yield* writeFile(fixture.data, 'people/bruno.md', 'changed')
          yield* writeFile(fixture.data, 'people/new.md', 'new')
          yield* db.exec('CREATE TABLE scratch (x)')
          return yield* engineError('invalid_usage', 'no')
        }),
      ),
    )

    expect(outcome).toMatchObject({ exitCode: 2 })
    expect(log(fixture.data)).toHaveLength(1)
    expect(readFileSync(person, 'utf8')).toBe(before)
    expect(existsSync(join(fixture.data, 'people', 'new.md'))).toBe(false)
    const tables = await fixture.ok(
      Effect.gen(function* () {
        const sqlite = yield* Sqlite
        return yield* sqlite.read((db) =>
          db.all("SELECT name FROM sqlite_master WHERE name = 'scratch'"),
        )
      }),
    )
    expect(tables).toEqual([])
  })

  test('what a write left outside a commit is set aside in the stash, not committed', async () => {
    const { fixture, vars, log } = useScratchRepo()
    writeFileSync(join(fixture.data, 'leftover.md'), 'half a write')

    await ok(
      makeEngineRun(
        vars,
        write({ author: IARA, message: 'note' }, () =>
          writeFile(fixture.data, 'note.md', 'note'),
        ),
      ),
    )

    expect(log(fixture.data)[0]).toBe(
      'Iara <iara@example.org>|Iara <iara@example.org>|note',
    )
    expect(
      gitIn(fixture.data, 'show', '--name-only', '--format=', 'HEAD'),
    ).toBe('note.md\n')
    expect(existsSync(join(fixture.data, 'leftover.md'))).toBe(false)
    expect(gitIn(fixture.data, 'stash', 'list')).toMatch(
      /filmes: changes left outside a commit/,
    )
  })

  test('concurrent writes are serialized, one commit each', async () => {
    const { fixture, vars, log } = useScratchRepo()
    const events: string[] = []
    const one = (n: number) =>
      write({ author: n % 2 ? BRUNO : IARA, message: `write ${n}` }, () =>
        Effect.gen(function* () {
          events.push(`start ${n}`)
          yield* Effect.yieldNow
          yield* writeFile(fixture.data, `file-${n}.md`, `${n}`)
          yield* Effect.yieldNow
          events.push(`end ${n}`)
        }),
      )

    await ok(
      makeEngineRun(
        vars,
        Effect.all([one(1), one(2), one(3)], { concurrency: 'unbounded' }),
      ),
    )

    for (let i = 0; i < events.length; i += 2)
      expect(events[i + 1]).toBe(events[i]?.replace('start', 'end'))
    const commits = log(fixture.data).slice(0, 3)
    expect(commits.map((c) => c.split('|')[2]).sort()).toEqual([
      'write 1',
      'write 2',
      'write 3',
    ])
    for (const n of [1, 2, 3]) {
      const sha = gitIn(
        fixture.data,
        'log',
        '--format=%H',
        '--grep',
        `^write ${n}$`,
      ).trim()
      expect(gitIn(fixture.data, 'show', '--name-only', '--format=', sha)).toBe(
        `file-${n}.md\n`,
      )
    }
  })

  test('outside a repository it writes without committing; with a remote set it refuses', async () => {
    const fixture = useFixture()
    const note = write({ author: BRUNO, message: 'note' }, () =>
      writeFile(fixture.data, 'note.md', 'note'),
    )

    await fixture.ok(note)
    const refused = await fixture.run(note, {
      FILMES_DATA_REMOTE: join(fixture.root, 'remote.git'),
    })

    expect(readFileSync(join(fixture.data, 'note.md'), 'utf8')).toBe('note')
    expect(refused).toEqual({
      exitCode: 1,
      output: {
        error: {
          code: 'missing_data',
          message: `repo de dados em ${fixture.data} não é um repositório git, e FILMES_DATA_REMOTE pede o push`,
        },
      },
    })
    expect(await fixture.ok(pushStatus)).toMatchObject({
      enabled: false,
      pending: 0,
    })
    expect(
      await fixture.ok(pushStatus, {
        FILMES_DATA_REMOTE: join(fixture.root, 'remote.git'),
      }),
    ).toMatchObject({
      enabled: true,
      pending: 0,
      lastError: expect.stringContaining('não é um repositório git'),
    })
  })

  test('a missing data folder is missing_data', async () => {
    const fixture = useFixture()

    const outcome = await fixture.run(
      write({ author: BRUNO, message: 'x' }, () => Effect.void),
      { FILMES_DADOS: join(fixture.root, 'nowhere') },
    )

    expect(outcome).toMatchObject({
      output: { error: { code: 'missing_data' } },
    })
  })
})

describe('the pessoa actions', () => {
  test('commit by the logged-in Pessoa, or by the engine when none; without a database, the file alone', async () => {
    const { fixture, vars, log } = useScratchRepo()
    await withEngine(vars, async (engine) => {
      await ok(
        engine.run(
          personVeto({
            person: 'teo',
            text: 'nunca vê terror',
            target: 'Q9001801',
            author: BRUNO,
          }),
        ),
      )
      // The same Veto again changes nothing: no commit.
      await ok(
        engine.run(
          personVeto({ person: 'teo', text: 'de novo', target: 'Q9001801' }),
        ),
      )
      await ok(engine.run(personSkip({ person: 'teo', text: 'curte mudo?' })))
    })
    rmSync(fixture.database)
    await ok(
      makeEngineRun(
        vars,
        personSkip({ person: 'iara', text: 'curte mudo?', author: IARA }),
      ),
    )

    expect(log(fixture.data)).toEqual([
      'Iara <iara@example.org>|Iara <iara@example.org>|pessoa pular iara: curte mudo?',
      'filmes <>|filmes <>|pessoa pular teo: curte mudo?',
      'Bruno <bruno@example.org>|Bruno <bruno@example.org>|pessoa vetar teo: Q9001801',
      'Setup <setup@example.org>|Setup <setup@example.org>|initial',
    ])
    expect(gitIn(fixture.data, 'status', '--porcelain')).toBe('')
  })

  test('a new Dono with her e-mail is one commit by the Dono who created her', async () => {
    const { fixture, vars, log } = useScratchRepo()

    await ok(
      makeEngineRun(
        vars,
        personCreate({
          name: 'Luana',
          owner: true,
          email: 'Luana@Example.org',
          author: BRUNO,
        }),
      ),
    )

    expect(log(fixture.data, 'master~1..master')).toEqual([
      'Bruno <bruno@example.org>|Bruno <bruno@example.org>|pessoa criar Luana',
    ])
    expect(gitIn(fixture.data, 'show', 'master:people/luana.md')).toContain(
      'email: luana@example.org\n',
    )
    expect(gitIn(fixture.data, 'status', '--porcelain')).toBe('')
  })
})

describe('push', () => {
  test('a failed push stays queued and the next attempt pushes it', async () => {
    const { fixture, vars, log, remote } = useScratchRepo()
    const away = `${remote}-away`

    await withEngine(vars, async (engine) => {
      renameSync(remote, away)
      await ok(
        engine.run(
          write({ author: BRUNO, message: 'queued' }, () =>
            writeFile(fixture.data, 'queued.md', 'q'),
          ),
        ),
      )
      // The background fiber may have tried too (the start and the write
      // kick it), so these are lower bounds.
      const first = await ok(engine.run(pushNow))
      expect(first).toMatchObject({ enabled: true, pending: 1 })
      expect(first.failures).toBeGreaterThanOrEqual(1)
      expect(first.lastError).toMatch(/git push exited with/)
      expect(first.failingSince).toMatch(/^\d{4}-\d{2}-\d{2}T/)

      await ok(engine.run(pushNow))
      const third = await ok(engine.run(pushNow))
      expect(third.failures).toBeGreaterThanOrEqual(ALERT_AFTER_FAILURES)
      expect(third.alert).toBe(true)
      expect(third.failingSince).toBe(first.failingSince)

      renameSync(away, remote)
      const pushed = await ok(engine.run(pushNow))
      expect(pushed).toEqual({
        enabled: true,
        pending: 0,
        failures: 0,
        failingSince: null,
        lastError: null,
        alert: false,
      })
    })

    expect(log(remote)[0]).toBe(
      'Bruno <bruno@example.org>|Bruno <bruno@example.org>|queued',
    )
  })

  test('commits left unpushed by a previous engine are still queued', async () => {
    const { fixture, vars, log, remote } = useScratchRepo()
    const away = `${remote}-away`
    renameSync(remote, away)
    await withEngine(vars, (engine) =>
      ok(
        engine.run(
          write({ author: IARA, message: 'before restart' }, () =>
            writeFile(fixture.data, 'r.md', 'r'),
          ),
        ),
      ),
    )
    renameSync(away, remote)

    await withEngine(vars, async (engine) => {
      expect((await ok(engine.run(pushStatus))).pending).toBeLessThanOrEqual(1)
      expect(await ok(engine.run(pushNow))).toMatchObject({ pending: 0 })
    })

    expect(log(remote)[0]).toMatch(/\|before restart$/)
  })

  test('sets the remote from FILMES_DATA_REMOTE when the clone has none', async () => {
    const { fixture, vars, log, remote } = useScratchRepo()
    gitIn(fixture.data, 'remote', 'remove', 'origin')

    await withEngine(vars, async (engine) => {
      await ok(
        engine.run(
          write({ author: BRUNO, message: 'first' }, () =>
            writeFile(fixture.data, 'f.md', 'f'),
          ),
        ),
      )
      expect(await ok(engine.run(pushNow))).toMatchObject({ pending: 0 })
    })

    expect(gitIn(fixture.data, 'remote', 'get-url', 'origin').trim()).toBe(
      remote,
    )
    expect(log(remote)[0]).toMatch(/\|first$/)
  })

  test('without FILMES_DATA_REMOTE nothing is pushed', async () => {
    const { fixture, log, remote } = useScratchRepo()

    const after = await fixture.ok(
      Effect.gen(function* () {
        yield* write({ author: BRUNO, message: 'local' }, () =>
          writeFile(fixture.data, 'l.md', 'l'),
        )
        return yield* pushNow
      }),
    )

    expect(after).toMatchObject({ enabled: false, pending: 0 })
    expect(log(fixture.data)[0]).toMatch(/\|local$/)
    expect(log(remote)).toHaveLength(1)
  })

  test('pushes over ssh with the deploy key, and never shows its path', async () => {
    const { fixture, log, remote } = useScratchRepo()
    const bin = join(fixture.root, 'bin')
    mkdirSync(bin)
    const calls = join(fixture.root, 'ssh-calls')
    const down = join(fixture.root, 'ssh-down')
    const key = join(fixture.root, 'secret dir', 'deploy-key')
    // The fake ssh logs its arguments, then either fails naming the key (as
    // ssh does) or runs git's command against the local bare repository.
    const ssh = join(bin, 'ssh')
    writeFileSync(
      ssh,
      `#!/bin/sh
printf '%s\\n' "$@" >> '${calls}'
if [ -e '${down}' ]; then
  echo "Load key \\"${key}\\": error in libcrypto" >&2
  exit 255
fi
for last; do :; done
cd '${fixture.root}' && exec sh -c "$last"
`,
    )
    chmodSync(ssh, 0o755)
    vi.stubEnv('PATH', `${bin}:${process.env.PATH ?? ''}`)
    writeFileSync(down, '')
    const vars: Vars = {
      ...fixture.vars,
      FILMES_DATA_REMOTE: 'fakehost:remote.git',
      FILMES_DATA_KEY: key,
    }

    await withEngine(vars, async (engine) => {
      await ok(
        engine.run(
          write({ author: BRUNO, message: 'over ssh' }, () =>
            writeFile(fixture.data, 's.md', 's'),
          ),
        ),
      )
      const failed = await ok(engine.run(pushNow))
      expect(failed.lastError).toContain('<chave>')
      expect(failed.lastError).not.toContain(key)

      rmSync(down)
      expect(await ok(engine.run(pushNow))).toMatchObject({ pending: 0 })
    })
    vi.unstubAllEnvs()

    const args = readFileSync(calls, 'utf8')
    expect(args).toContain(`-i\n${key}\n`)
    expect(args).toContain('IdentitiesOnly=yes')
    expect(args).toContain(`UserKnownHostsFile=${key}.known_hosts`)
    expect(log(remote)[0]).toMatch(/\|over ssh$/)
  })
})

describe('authorOf', () => {
  test('signs with the Pessoa’s name and email, or an empty email', async () => {
    const fixture = useFixture()

    const [bruno, rosa] = await fixture.ok(
      Effect.all([resolvePerson('bruno'), resolvePerson('rosa')]),
    )

    expect(authorOf(bruno)).toEqual(BRUNO)
    expect(authorOf(rosa)).toEqual({ name: rosa.name, email: '' })
  })
})

/** One request on a fresh engine. */
function makeEngineRun<A, E>(
  vars: Vars,
  effect: Effect.Effect<A, E, EngineServices | Run>,
) {
  return withEngine(vars, (engine) => engine.run(effect))
}
