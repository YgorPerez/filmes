// `pnpm db:publish`: ships a derived SQLite built on servidor-azul to the VPS
// and swaps the live app onto it (ADR 0005, ADR 0006). From the repository
// root:
//
//   VPS_HOST=… [VPS_USER=root] [VPS_PORT=22] [VPS_SSH_KEY=…] \
//     pnpm db:publish <file.sqlite> [--version <name>] [--sha <commit>] [--dry-run]
//   … pnpm db:publish --build [--data <filmes-dados>] [--config <config>]
//     [--version <name>] [--sha <commit>] [--dry-run]
//   … pnpm db:publish --rollback [<version>] [--dry-run]
//
// `--build` first builds the file with the engine's `rebuild` from
// filmes-dados (`--data`,
// or `FILMES_DADOS`) and the config (`--config`, the repo's `config/` by
// default), read where they are (`db-build.ts`); the dumps
// come from the caller's environment. It refuses a filmes-dados with
// changes or behind its remote. A dry run
// builds too, and keeps the file to look at; a publish deletes it after the
// swap, and keeps it when the publish stops, to send again by path.
//
// The file goes up with rsync to `/opt/filmes/data/db/<version>.sqlite`
// (an interrupted upload resumes when run again with the same `--version`),
// then an image starts on the other port of the pair with
// `FILMES_DATABASE=/data/db/<version>.sqlite`: the commit's of `--sha`,
// with `--build` the checkout's HEAD by default, or else the live one. The
// app's `/saude` must answer before the swap, so code of another schema
// than the database's never goes live (#258). The old container stops
// after Nginx moves over. The VPS keeps the live version and the previous
// one; `--rollback` swaps back to the previous one, or to the version asked
// for. `--dry-run` prints the plan and touches nothing.
//
// What each step does on the VPS is the plan (`deploy-plan.ts`), followed as
// `vps.ts` follows it; here lives only the check of the local file and the
// command line.
//
// Runs on plain `node`, which reads TypeScript by itself: only syntax it
// strips.

import {
  closeSync,
  mkdtempSync,
  openSync,
  readSync,
  rmSync,
  statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import {
  REPO,
  type Runner,
  buildDatabase,
  checkDataCheckout,
  headOf,
  spawnRunner,
} from './db-build.ts'
import { keyFile } from './ssh-key.ts'
import {
  type Step,
  type VpsPaths,
  databasePublishPlan,
  databaseRollbackPlan,
} from './deploy-plan.ts'
import {
  type Target,
  type Vps,
  followThePlan,
  overSsh,
  targetFrom,
} from './vps.ts'

/** The first 16 bytes of every SQLite database file. */
const HEADER = 'SQLite format 3\0'

/** The default version name: the UTC time of the publish,
 * `20261124-153000`. */
function versionAt(date: Date) {
  const iso = date.toISOString()
  return `${iso.slice(0, 10).replaceAll('-', '')}-${iso.slice(11, 19).replaceAll(':', '')}`
}

const sizeOf = (path: string) => {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

/** The local file's size, after checking it is a whole SQLite database: a
 * `-wal` or `-journal` beside it holds pages the file alone does not. */
function checkDatabase(file: string) {
  let stat
  try {
    stat = statSync(file)
  } catch {
    throw new Error(`${file} does not exist.`)
  }
  if (!stat.isFile()) throw new Error(`${file} is not a file.`)
  const header = Buffer.alloc(HEADER.length)
  const fd = openSync(file, 'r')
  try {
    readSync(fd, header, 0, HEADER.length, 0)
  } finally {
    closeSync(fd)
  }
  if (header.toString('latin1') !== HEADER)
    throw new Error(`${file} is not a SQLite database.`)
  for (const companion of ['-wal', '-journal'])
    if (sizeOf(`${file}${companion}`) > 0)
      throw new Error(
        `${file}${companion} has pages the database does not: close whatever has it open, then publish.`,
      )
  return stat.size
}

/** The plan, as `--dry-run` prints it: each step's name, what it sends and
 * the script it runs on the VPS. */
function describePlan(steps: Step[]) {
  return steps
    .map((step) => {
      const send = step.send
        ? `\n# Then sends ${step.send.file} to ${step.send.to}.`
        : ''
      return `## ${step.name}${send}\n${step.script.trim()}\n`
    })
    .join('\n')
}

type Command =
  | {
      mode: 'publish'
      file: string
      version?: string
      sha?: string
      dryRun: boolean
    }
  | {
      mode: 'build'
      data?: string
      config?: string
      version?: string
      sha?: string
      dryRun: boolean
    }
  | { mode: 'rollback'; version?: string; dryRun: boolean }

const USAGE =
  'Usage: VPS_HOST=… [VPS_USER=root] [VPS_PORT=22] [VPS_SSH_KEY=…] pnpm db:publish <file.sqlite> | --build [--data <filmes-dados>] [--config <config>], then [--version <name>] [--sha <commit>] [--dry-run] | --rollback [<version>] [--dry-run]'

/** A publish's command line: a file, or `--build` and its folders. */
function parsePublish(args: string[], dryRun: boolean): Command | string {
  let parsed
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      options: {
        version: { type: 'string' },
        sha: { type: 'string' },
        build: { type: 'boolean' },
        data: { type: 'string' },
        config: { type: 'string' },
      },
    })
  } catch {
    return USAGE
  }
  const { positionals, values } = parsed
  if (values.version === '' || values.sha === '') return USAGE
  const { version, sha, build, data, config } = values
  if (build)
    return positionals.length === 0
      ? { mode: 'build', data, config, version, sha, dryRun }
      : USAGE
  const [file, ...extra] = positionals
  if (!file || extra.length > 0 || data !== undefined || config !== undefined)
    return USAGE
  return { mode: 'publish', file, version, sha, dryRun }
}

/** The command line, or the usage when it does not parse. */
function parseArguments(argv: readonly string[]): Command | string {
  const rest = argv.filter((a) => a !== '--dry-run')
  const dryRun = rest.length < argv.length
  if (rest[0] === '--rollback') {
    if (rest.length > 2 || rest[1]?.startsWith('-')) return USAGE
    return { mode: 'rollback', version: rest[1], dryRun }
  }
  return parsePublish(rest, dryRun)
}

/** Where `--build` takes filmes-dados from, as an absolute path. */
function dataFolder(
  data: string | undefined,
  env: Record<string, string | undefined>,
  here: string,
) {
  const folder = data ?? env.FILMES_DADOS
  if (!folder)
    throw new Error(
      '--build needs filmes-dados: pass --data <folder> or set FILMES_DADOS.',
    )
  return resolve(here, folder)
}

/** The plan for a database file, after checking it. */
const publishPlan = (
  file: string,
  version: string,
  sha: string | undefined,
  paths?: VpsPaths,
) =>
  databasePublishPlan({ file, size: checkDatabase(file), version, sha, paths })

/** Runs the command line: prints the plan on a dry run, which needs no VPS,
 * or follows it on the VPS from the `VPS_*` variables. Whatever stops it
 * throws, with a message for the terminal. */
export function runCommand({
  argv,
  env,
  connect,
  print,
  say,
  ...where
}: {
  argv: readonly string[]
  env: Record<string, string | undefined>
  connect: (target: Target) => Vps
  print: (text: string) => void
  say: (line: string) => void
  /** Where a relative path starts from. */
  here: string
  /** The time the default version is named after. */
  date: Date
  paths?: VpsPaths
  /** Runs the engine's build process for `--build`. */
  run?: Runner
  /** The commit `--build` publishes the image of, without `--sha`. */
  head?: () => string
  /** Refuses a filmes-dados `--build` must not build from. */
  checkData?: (data: string, say: (line: string) => void) => void
}) {
  const {
    here,
    date,
    paths,
    run = spawnRunner,
    head = headOf,
    checkData = checkDataCheckout,
  } = where
  const command = parseArguments(argv)
  if (typeof command === 'string') throw new Error(command)
  const target = command.dryRun ? undefined : targetFrom(env)
  if (typeof target === 'string') throw new Error(target)
  const follow = (steps: Step[]) => {
    if (target) followThePlan({ steps, vps: connect(target), say })
    else print(describePlan(steps))
  }
  if (command.mode === 'rollback')
    return follow(databaseRollbackPlan({ version: command.version, paths }))
  const version = command.version ?? versionAt(date)
  if (command.mode === 'publish')
    return follow(
      publishPlan(resolve(here, command.file), version, command.sha, paths),
    )

  const data = dataFolder(command.data, env, here)
  checkData(data, say)
  // The image of the code that builds the database goes live with it.
  const sha = command.sha ?? head()
  const config = resolve(here, command.config ?? join(REPO, 'config'))
  const file = join(
    mkdtempSync(join(tmpdir(), 'filmes-db-')),
    `${version}.sqlite`,
  )
  say(`building ${version} from ${data} with ${config}, for sha-${sha}`)
  try {
    buildDatabase({ data, config, database: file, env, run })
  } catch (error) {
    rmSync(dirname(file), { recursive: true, force: true })
    throw error
  }
  say(`built ${file}`)
  try {
    follow(publishPlan(file, version, sha, paths))
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\nThe database stays at ${file}: pnpm db:publish ${file} --version ${version} --sha ${sha}`,
      { cause: error },
    )
  }
  if (target) rmSync(dirname(file), { recursive: true, force: true })
}

if (import.meta.main) {
  try {
    runCommand({
      argv: process.argv.slice(2),
      env: process.env,
      connect: (target) => overSsh({ ...target, key: keyFile(target.key) }),
      print: (text) => console.log(text),
      say: (line) => console.log(`[db] ${line}`),
      // pnpm runs the script from the root; a relative path is the caller's.
      here: process.env.INIT_CWD ?? process.cwd(),
      date: new Date(),
    })
  } catch (error) {
    console.error(
      `[db] ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exitCode = 1
  }
}
