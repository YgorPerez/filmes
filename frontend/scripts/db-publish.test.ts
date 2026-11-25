// `db:publish` against the fake VPS (`fake-vps.ts`): the same plan that goes
// over SSH, run in a bash with a fake docker, on a VPS that already serves
// temestudo and has filmes' app live.
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vite-plus/test'
import {
  FIXTURE_TODAY,
  ROOT,
  useFixture,
} from '../../packages/engine/test/fixture.ts'
import type { Runner } from './db-build.ts'
import { runCommand } from './db-publish.ts'
import { fakeFrontend, fakeVps, NEIGHBOUR_CONTAINERS } from './fake-vps.ts'
import { type Vps, publish } from './vps.ts'

const SHA_1 = 'aaaaaaa'
const SHA_2 = 'bbbbbbb'
const DATE = new Date('2026-11-24T15:30:00Z')

/** `pnpm db:publish <argv>` with the `VPS_*` of `env`, on the VPS `connect`
 * gives; returns what it printed. */
function dbPublish(
  argv: string[],
  {
    env = {},
    connect = () => {
      throw new Error('This run should not reach the VPS.')
    },
    say = () => {},
    here = '/',
    paths,
  }: {
    env?: Record<string, string>
    connect?: Parameters<typeof runCommand>[0]['connect']
    say?: (line: string) => void
    here?: string
    paths?: Parameters<typeof runCommand>[0]['paths']
  } = {},
) {
  const printed: string[] = []
  runCommand({
    argv,
    env,
    connect,
    print: (text) => printed.push(text),
    say,
    here,
    date: DATE,
    paths,
  })
  return printed.join('\n')
}

/** A local database file: the SQLite header, then what tells it apart. */
function aDatabase(content: string, header = 'SQLite format 3\0') {
  const folder = mkdtempSync(join(tmpdir(), 'db-publish-'))
  const file = join(folder, 'filmes.sqlite')
  writeFileSync(file, `${header}${content}`)
  return file
}

function aVps({ appLive = true } = {}) {
  const vps = fakeVps()
  const log: string[] = []
  const say = (line: string) => log.push(line)
  const neighbourBefore = vps.neighbour()
  const deploy = (sha: string) =>
    publish({
      output: fakeFrontend(sha),
      sha,
      vps: vps.vps,
      paths: vps.paths,
      say,
    })
  if (appLive) deploy(SHA_1)
  vps.calls()
  log.length = 0
  const follow = (argv: string[], through: Vps = vps.vps) =>
    void dbPublish(argv, {
      env: { VPS_HOST: 'vps.test' },
      connect: () => through,
      say,
      paths: vps.paths,
    })
  const db = join(vps.paths.data, 'db')
  return {
    ...vps,
    log,
    neighbourBefore,
    deploy,
    publishDatabase: (file: string, version: string, through?: Vps) =>
      follow([file, '--version', version], through),
    rollbackDatabase: (version?: string) =>
      follow(version ? ['--rollback', version] : ['--rollback']),
    /** What `db/` holds, by name. */
    versions: () => readdirSync(db).sort(),
    db,
    /** The database the live app opens, the markers and the app's image. */
    live: () => {
      const app = vps.container('filmes-app')
      return {
        database: vps.variables('filmes-app'),
        dbLive: vps.read(join(vps.paths.folder, 'db-live')),
        dbPrevious: vps.read(join(vps.paths.folder, 'db-previous')),
        image: app?.image,
        port: app?.port,
      }
    },
  }
}

const opens = (version: string) => [
  `FILMES_DATABASE=/data/db/${version}.sqlite`,
]

describe.skipIf(process.platform === 'win32')('db:publish on the VPS', () => {
  it('uploads the version, swaps the live image onto it on the other port, and keeps the app SHA', () => {
    const vps = aVps()
    const file = aDatabase('v1')

    vps.publishDatabase(file, 'v1')

    expect(vps.live()).toEqual({
      database: opens('v1'),
      dbLive: 'v1\n',
      dbPrevious: null,
      image: `filmes-app:sha-${SHA_1}`,
      port: '3092',
    })
    expect(vps.read(join(vps.db, 'v1.sqlite'))).toBe('SQLite format 3\0v1')
    expect(vps.versions()).toEqual(['v1.sqlite'])
    expect(vps.read(join(vps.paths.folder, 'live'))).toBe(`${SHA_1}\n`)
    expect(vps.read(join(vps.paths.folder, 'previous'))).toBeNull()
    expect(vps.images()).toContain(`filmes-app:sha-${SHA_1}`)
    const calls = vps.calls()
    expect(calls).toContain(`send ${file} ${join(vps.db, 'v1.sqlite.part')}`)
    expect(calls).toContain(`chown 1000:1000 ${join(vps.db, 'v1.sqlite.part')}`)
    expect(vps.log).toContain(
      'App sha-aaaaaaa live on port 3092, with the database v1, for cinema.temestudo.cloud.',
    )
  })

  it('the log times the upload, the install, the swap and the retention', () => {
    const vps = aVps()

    vps.publishDatabase(aDatabase('v1'), 'v1')

    const times = vps.log.filter((l) => /took|Total/.test(l))
    expect(times.map((l) => l.replace(/[\d.]+ s/, 'N s'))).toEqual([
      'Upload took N s.',
      'Install took N s.',
      'Swap took N s.',
      'Retention took N s.',
      'Total: N s.',
    ])
  })

  it('keeps the live version and the previous one, and deletes the older ones', () => {
    const vps = aVps()
    vps.publishDatabase(aDatabase('v1'), 'v1')
    writeFileSync(join(vps.db, 'v1.sqlite-wal'), '')
    vps.publishDatabase(aDatabase('v2'), 'v2')

    vps.publishDatabase(aDatabase('v3'), 'v3')

    expect(vps.versions()).toEqual(['v2.sqlite', 'v3.sqlite'])
    expect(vps.live()).toMatchObject({
      database: opens('v3'),
      dbLive: 'v3\n',
      dbPrevious: 'v2\n',
    })
    expect(vps.log.join('\n')).toMatch(
      /^Deleted db\/v1\.sqlite\.\nDeleted db\/v1\.sqlite-wal\.$/m,
    )
  })

  it('deletes the part an interrupted upload of another version left behind', () => {
    const vps = aVps()
    vps.publishDatabase(aDatabase('v1'), 'v1')
    writeFileSync(join(vps.db, 'lost.sqlite.part'), 'SQLite format 3\0half')

    vps.publishDatabase(aDatabase('v2'), 'v2')

    expect(vps.versions()).toEqual(['v1.sqlite', 'v2.sqlite'])
  })

  it("leaves auth.sqlite, the sources' cache and the neighbours alone", () => {
    const vps = aVps()
    writeFileSync(join(vps.paths.data, 'auth.sqlite'), 'logins')
    writeFileSync(join(vps.paths.data, 'cache.sqlite'), 'answers')

    vps.publishDatabase(aDatabase('v1'), 'v1')
    vps.publishDatabase(aDatabase('v2'), 'v2')
    vps.publishDatabase(aDatabase('v3'), 'v3')
    vps.rollbackDatabase()

    expect(vps.read(join(vps.paths.data, 'auth.sqlite'))).toBe('logins')
    expect(vps.read(join(vps.paths.data, 'cache.sqlite'))).toBe('answers')
    expect(vps.neighbour()).toEqual(vps.neighbourBefore)
    for (const [name, image, port] of NEIGHBOUR_CONTAINERS)
      expect(vps.container(name)).toEqual({
        image,
        port,
        volume: '',
        running: true,
      })
  })

  it('an app deploy after it keeps the live database', () => {
    const vps = aVps()
    vps.publishDatabase(aDatabase('v1'), 'v1')

    vps.deploy(SHA_2)

    expect(vps.live()).toMatchObject({
      database: opens('v1'),
      dbLive: 'v1\n',
      image: `filmes-app:sha-${SHA_2}`,
    })
  })

  it('rolling back without a version swaps to the previous one, and twice comes back', () => {
    const vps = aVps()
    vps.publishDatabase(aDatabase('v1'), 'v1')
    vps.publishDatabase(aDatabase('v2'), 'v2')

    vps.rollbackDatabase()

    expect(vps.live()).toEqual({
      database: opens('v1'),
      dbLive: 'v1\n',
      dbPrevious: 'v2\n',
      image: `filmes-app:sha-${SHA_1}`,
      port: '3092',
    })
    expect(vps.log).toContain(
      'App sha-aaaaaaa live on port 3092, with the database v1, for cinema.temestudo.cloud.',
    )

    vps.rollbackDatabase()

    expect(vps.live()).toMatchObject({ database: opens('v2'), dbLive: 'v2\n' })
  })

  it('rolling back to a version asked for swaps to it', () => {
    const vps = aVps()
    vps.publishDatabase(aDatabase('v1'), 'v1')
    vps.publishDatabase(aDatabase('v2'), 'v2')

    vps.rollbackDatabase('v1')

    expect(vps.live()).toMatchObject({ database: opens('v1'), dbLive: 'v1\n' })
  })

  it('rolling back to a version the VPS did not keep leaves what is live alone', () => {
    const vps = aVps()
    vps.publishDatabase(aDatabase('v1'), 'v1')
    const before = vps.live()

    expect(() => vps.rollbackDatabase('v0')).toThrow(
      'The VPS does not have the database v0.',
    )
    expect(vps.live()).toEqual(before)
  })

  it('rolling back with no previous database asks for the version', () => {
    const vps = aVps()
    vps.publishDatabase(aDatabase('v1'), 'v1')

    expect(() => vps.rollbackDatabase()).toThrow(
      'The VPS kept no previous database: give the version.',
    )
  })

  it('a new container that does not answer goes; the old database stays live and the upload waits for the next retention', () => {
    const vps = aVps()
    vps.publishDatabase(aDatabase('v1'), 'v1')
    const before = vps.live()
    vps.breakWith('app-does-not-answer')

    expect(() => vps.publishDatabase(aDatabase('v2'), 'v2')).toThrow(
      /The new app did not answer on \/ at port 3091/,
    )
    expect(vps.live()).toEqual(before)
    expect(vps.versions()).toEqual(['v1.sqlite', 'v2.sqlite'])
    expect(vps.containers()).not.toContain('filmes-app-next')
  })

  it('with no app live, stops before the upload', () => {
    const vps = aVps({ appLive: false })

    expect(() => vps.publishDatabase(aDatabase('v1'), 'v1')).toThrow(
      'No app is live on the VPS: publish the app first',
    )
    expect(vps.calls().filter((c) => c.startsWith('send'))).toEqual([])
  })

  it('a version the VPS already has stops before the upload', () => {
    const vps = aVps()
    vps.publishDatabase(aDatabase('v1'), 'v1')
    vps.calls()

    expect(() => vps.publishDatabase(aDatabase('other'), 'v1')).toThrow(
      'The VPS already has the database v1.',
    )
    expect(vps.calls().filter((c) => c.startsWith('send'))).toEqual([])
    expect(vps.read(join(vps.db, 'v1.sqlite'))).toBe('SQLite format 3\0v1')
  })

  it('stops before the upload when the disk would keep less than 1 GB free', () => {
    const vps = aVps()
    const file = aDatabase('v1')
    const size = 'SQLite format 3\0v1'.length
    vps.freeBytes(1024 ** 3 + size - 1)

    expect(() => vps.publishDatabase(file, 'v1')).toThrow(
      /The VPS has \d+ bytes free in .*db; the database needs \d+, with 1 GB left/,
    )
    expect(vps.calls().filter((c) => c.startsWith('send'))).toEqual([])
  })

  it('the part an interrupted upload of the same version left counts as already there', () => {
    const vps = aVps()
    const file = aDatabase('v1')
    const size = 'SQLite format 3\0v1'.length
    writeFileSync(join(vps.db, 'v1.sqlite.part'), 'SQLite format 3\0')
    vps.freeBytes(1024 ** 3 + size - 'SQLite format 3\0'.length)

    vps.publishDatabase(file, 'v1')

    expect(vps.live()).toMatchObject({ dbLive: 'v1\n' })
  })

  it('an upload that arrives without the SQLite header or the size stays as a part, and nothing swaps', () => {
    const vps = aVps()
    vps.publishDatabase(aDatabase('v1'), 'v1')
    const before = vps.live()
    const broken = {
      ...vps.vps,
      send: (_: string, to: string) => writeFileSync(to, 'garbage'),
    }

    expect(() => vps.publishDatabase(aDatabase('v2'), 'v2', broken)).toThrow(
      'The upload of v2 is not a SQLite database',
    )
    expect(vps.live()).toEqual(before)
    expect(vps.versions()).toEqual(['v1.sqlite', 'v2.sqlite.part'])
  })

  it('a version that could break out of the script stops before the VPS', () => {
    const vps = aVps()

    expect(() => vps.publishDatabase(aDatabase('x'), 'v1; rm -rf /')).toThrow(
      'is not a database version',
    )
    expect(() => vps.rollbackDatabase('../auth')).toThrow(
      'is not a database version',
    )
    expect(vps.calls()).toEqual([])
  })
})

describe('the local database', () => {
  const dryRun = (file: string) => dbPublish([file, '--dry-run'])

  it('a file that is not a SQLite database stops the publish', () => {
    expect(() => dryRun(aDatabase('x', 'not a database..'))).toThrow(
      'is not a SQLite database',
    )
  })

  it('a missing file, or a folder, stops the publish', () => {
    expect(() => dryRun('/nowhere/filmes.sqlite')).toThrow('does not exist')
    expect(() => dryRun(tmpdir())).toThrow('is not a file')
  })

  it('a -wal or a -journal with pages beside it stops the publish', () => {
    const file = aDatabase('x')
    writeFileSync(`${file}-wal`, '')
    expect(() => dryRun(file)).not.toThrow()
    writeFileSync(`${file}-wal`, 'pages')
    expect(() => dryRun(file)).toThrow(/-wal has pages the database does not/)
    writeFileSync(`${file}-wal`, '')
    writeFileSync(`${file}-journal`, 'pages')
    expect(() => dryRun(file)).toThrow(/-journal has pages/)
  })
})

describe('the dry run', () => {
  it('prints each step with what it sends and its script, on the real paths, without the VPS', () => {
    const file = aDatabase('x')

    const text = dbPublish([file, '--version', 'v1', '--dry-run'])

    expect(text.match(/^## .*/gm)).toEqual([
      '## Upload',
      '## Install',
      '## Swap',
      '## Retention',
    ])
    expect(text).toContain(
      `# Then sends ${file} to /opt/filmes/data/db/v1.sqlite.part.`,
    )
    expect(text).toContain('FILMES_DATABASE=/data/db/$DB.sqlite')
  })

  it('a relative path is from the caller, and the version defaults to the UTC time', () => {
    const file = aDatabase('x')

    const text = dbPublish(['--dry-run', 'filmes.sqlite'], {
      here: join(file, '..'),
    })

    expect(text).toContain(
      `# Then sends ${file} to /opt/filmes/data/db/20261124-153000.sqlite.part.`,
    )
  })

  it('prints the rollback as one swap, to the previous version or the one asked for', () => {
    const previous = dbPublish(['--rollback', '--dry-run'])
    const asked = dbPublish(['--dry-run', '--rollback', 'v1'])

    expect(previous.match(/^## .*/gm)).toEqual(['## Swap'])
    expect(previous).toContain('DB=$(cat db-previous')
    expect(asked).toContain('DB=v1\n')
  })
})

describe('the command line', () => {
  it('goes to the VPS of the VPS_* variables', () => {
    const vps = fakeVps()
    const targets: unknown[] = []

    expect(() =>
      dbPublish(['--rollback'], {
        env: { VPS_HOST: 'vps.test', VPS_PORT: '2222' },
        connect: (target) => {
          targets.push(target)
          return vps.vps
        },
        paths: vps.paths,
      }),
    ).toThrow('No app is live on the VPS')
    expect(targets).toEqual([
      { host: 'vps.test', user: 'root', port: '2222', key: undefined },
    ])
  })

  it('without VPS_HOST stops before anything but a dry run', () => {
    expect(() => dbPublish(['--rollback'])).toThrow('VPS_HOST is missing.')
  })

  it('anything else gets the usage', () => {
    for (const argv of [
      [],
      ['--version', 'v1'],
      ['db.sqlite', '--version'],
      ['db.sqlite', '--other', 'v1'],
      ['db.sqlite', '--version', 'v1', 'extra'],
      ['--rollback', 'v1', 'v2'],
      ['--rollback', '--version'],
      ['--build', 'db.sqlite'],
      ['db.sqlite', '--data', 'dados'],
      ['db.sqlite', '--python'],
      ['db.sqlite', '--version', ''],
    ])
      expect(() => dbPublish(argv)).toThrow(/^Usage: /)
  })
})

/** Row counts of every table, by name. */
function rowCounts(file: string) {
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    const counts: Record<string, number> = {}
    for (const { name } of db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as { name: string }[])
      counts[name] = Number(
        (
          db.prepare(`SELECT count(*) AS n FROM "${name}"`).get() as {
            n: number
          }
        ).n,
      )
    return counts
  } finally {
    db.close()
  }
}

/** `runCommand` with `--build`: what it printed and said. */
function build(
  argv: string[],
  {
    env = {},
    run,
    connect = () => {
      throw new Error('This run should not reach the VPS.')
    },
    paths,
  }: {
    env?: Record<string, string | undefined>
    run?: Runner
    connect?: Parameters<typeof runCommand>[0]['connect']
    paths?: Parameters<typeof runCommand>[0]['paths']
  } = {},
) {
  const printed: string[] = []
  const said: string[] = []
  runCommand({
    argv: ['--build', ...argv],
    env,
    connect,
    print: (text) => printed.push(text),
    say: (line) => said.push(line),
    here: '/',
    date: DATE,
    paths,
    run,
  })
  const built = said.find((line) => line.startsWith('built '))?.slice(6)
  return { printed: printed.join('\n'), said, built }
}

/** A build process that writes a SQLite header where it is told, and
 * keeps what it was given. */
function fakeBuilder() {
  const calls: {
    command: string
    args: readonly string[]
    env: Record<string, string | undefined>
    seen: string[]
  }[] = []
  const run: Runner = (command, args, { env }) => {
    calls.push({
      command,
      args,
      env,
      seen: [
        ...readdirSync(env.FILMES_DADOS!).map((name) => `data/${name}`),
        ...readdirSync(env.FILMES_CONFIG!).map((name) => `config/${name}`),
      ],
    })
    writeFileSync(env.FILMES_BANCO!, 'SQLite format 3\0built')
    return { status: 0, stdout: '{}', stderr: '' }
  }
  return { run, calls }
}

describe('db:publish --build', () => {
  for (const [builder, flags] of [
    ['engine', []],
    ['Python engine', ['--python']],
  ] as const)
    it(`a dry run builds the fixture with the ${builder} and prints the plan for it`, () => {
      const fixture = useFixture()
      const env = Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) => !key.startsWith('FILMES_'),
        ),
      )

      const { printed, built } = build(
        [
          '--data',
          fixture.data,
          '--config',
          fixture.config,
          '--version',
          'v1',
          '--dry-run',
          ...flags,
        ],
        {
          env: {
            ...env,
            FILMES_CATALOGO: join(ROOT, 'tests/fixture/catalogo'),
            FILMES_HOJE: FIXTURE_TODAY,
            FILMES_LOCAL: join(fixture.root, 'no-local.toml'),
          },
        },
      )

      expect(built).toMatch(/v1\.sqlite$/)
      expect(printed).toContain(
        `# Then sends ${built} to /opt/filmes/data/db/v1.sqlite.part.`,
      )
      // The same database the engine built from the fixture.
      expect(rowCounts(built!)).toEqual(rowCounts(fixture.database))
      expect(rowCounts(built!)['pessoas']).toBe(5)
      rmSync(dirname(built!), { recursive: true })
    }, 120_000)

  it('gives the engine filmes-dados and the config in English', () => {
    const fixture = useFixture()
    const builder = fakeBuilder()

    build(['--data', fixture.data, '--config', fixture.config, '--dry-run'], {
      env: { FILMES_CATALOGO: '/dumps' },
      run: builder.run,
    })

    const [call] = builder.calls
    expect(call!.command).toBe(process.execPath)
    expect(call!.args).toEqual([join(import.meta.dirname, 'db-rebuild.ts')])
    expect(call!.env.FILMES_CATALOGO).toBe('/dumps')
    expect(call!.seen).toContain('data/people')
    expect(call!.seen).toContain('config/weights.toml')
    expect(call!.seen).not.toContain('config/pesos.toml')
  })

  it('with --python gives Python filmes-dados and the config in Portuguese, and deletes the file after the swap', () => {
    const fixture = useFixture()
    const vps = aVps()
    const builder = fakeBuilder()

    const { built } = build(
      [
        '--data',
        fixture.data,
        '--config',
        fixture.config,
        '--version',
        'v1',
        '--python',
      ],
      {
        env: { VPS_HOST: 'vps.test', FILMES_CATALOGO: '/dumps' },
        run: builder.run,
        connect: () => vps.vps,
        paths: vps.paths,
      },
    )

    const [call] = builder.calls
    expect(call!.args).toEqual([
      'run',
      'python',
      '-m',
      'filmes',
      'reconstruir',
      '--json',
    ])
    expect(call!.env.FILMES_CATALOGO).toBe('/dumps')
    expect(call!.seen).toContain('data/pessoas')
    expect(call!.seen).toContain('config/pesos.toml')
    expect(call!.seen).not.toContain('config/weights.toml')
    expect(vps.live()).toMatchObject({ dbLive: 'v1\n' })
    expect(vps.read(join(vps.db, 'v1.sqlite'))).toBe('SQLite format 3\0built')
    // Neither the scratch folders nor the built file stay behind.
    expect(existsSync(dirname(built!))).toBe(false)
    expect(existsSync(call!.env.FILMES_DADOS!)).toBe(false)
  })

  it('takes filmes-dados from FILMES_DADOS', () => {
    const fixture = useFixture()
    const builder = fakeBuilder()

    build(['--config', fixture.config, '--dry-run'], {
      env: { FILMES_DADOS: fixture.data },
      run: builder.run,
    })

    expect(builder.calls).toHaveLength(1)
  })

  it('without filmes-dados it says how to give it', () => {
    expect(() => build(['--dry-run'])).toThrow(
      '--build needs filmes-dados: pass --data <folder> or set FILMES_DADOS.',
    )
  })

  it("stops with the engine's error, and leaves nothing behind", () => {
    const fixture = useFixture()
    let database = ''
    const failing: Runner = (_, __, { env }) => {
      database = env.FILMES_BANCO!
      return {
        status: 1,
        stdout:
          '{"error": {"code": "missing_catalog", "message": "sem dumps"}}',
        stderr: '',
      }
    }

    expect(() =>
      build(['--data', fixture.data, '--config', fixture.config, '--dry-run'], {
        run: failing,
      }),
    ).toThrow(
      'the engine could not build the database: missing_catalog: sem dumps',
    )
    expect(existsSync(dirname(database))).toBe(false)
  })

  it("with --python stops with Python's error", () => {
    const fixture = useFixture()
    const failing: Runner = () => ({
      status: 1,
      stdout: '{"erro": {"codigo": "config_ausente", "mensagem": "sem dumps"}}',
      stderr: '',
    })

    expect(() =>
      build(
        [
          '--data',
          fixture.data,
          '--config',
          fixture.config,
          '--dry-run',
          '--python',
        ],
        { run: failing },
      ),
    ).toThrow(
      'the Python engine could not build the database: config_ausente: sem dumps',
    )
  })

  it('a build that never started says what it printed', () => {
    const fixture = useFixture()
    const failing: Runner = () => ({
      status: null,
      stdout: '',
      stderr: 'spawn node ENOENT',
    })

    expect(() =>
      build(['--data', fixture.data, '--config', fixture.config, '--dry-run'], {
        run: failing,
      }),
    ).toThrow(
      'the engine could not build the database: exit signal\nspawn node ENOENT',
    )
  })

  it('a publish that stops keeps the built file and says how to send it again', () => {
    const fixture = useFixture()
    const vps = aVps({ appLive: false })
    const builder = fakeBuilder()
    let message = ''
    try {
      build(
        ['--data', fixture.data, '--config', fixture.config, '--version', 'v1'],
        {
          env: { VPS_HOST: 'vps.test' },
          run: builder.run,
          connect: () => vps.vps,
          paths: vps.paths,
        },
      )
    } catch (error) {
      message = (error as Error).message
    }

    const file =
      /The database stays at (\S+): pnpm db:publish \S+ --version v1$/m.exec(
        message,
      )?.[1]
    expect(message).toContain('No app is live on the VPS')
    expect(readFileSync(file!, 'utf8')).toBe('SQLite format 3\0built')
    rmSync(dirname(file!), { recursive: true })
  })
})
