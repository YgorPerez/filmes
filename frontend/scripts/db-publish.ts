// `pnpm db:publish`: ships a derived SQLite built on servidor-azul to the VPS
// and swaps the live app onto it (ADR 0005, ADR 0006). From the repository
// root:
//
//   VPS_HOST=… [VPS_USER=root] [VPS_PORT=22] [VPS_SSH_KEY=…] \
//     pnpm db:publish <file.sqlite> [--version <name>] [--dry-run]
//   … pnpm db:publish --rollback [<version>] [--dry-run]
//
// The file goes up with rsync to `/opt/filmes/data/db/<version>.sqlite`
// (an interrupted upload resumes when run again with the same `--version`),
// then the live image starts on the other port of the pair with
// `FILMES_DATABASE=/data/db/<version>.sqlite`, and the old container stops
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

import { closeSync, openSync, readSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
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
  | { mode: 'publish'; file: string; version?: string; dryRun: boolean }
  | { mode: 'rollback'; version?: string; dryRun: boolean }

const USAGE =
  'Usage: VPS_HOST=… [VPS_USER=root] [VPS_PORT=22] [VPS_SSH_KEY=…] pnpm db:publish <file.sqlite> [--version <name>] [--dry-run] | --rollback [<version>] [--dry-run]'

/** The command line, or the usage when it does not parse. */
function parseArguments(argv: readonly string[]): Command | string {
  const rest = argv.filter((a) => a !== '--dry-run')
  const dryRun = rest.length < argv.length
  if (rest[0] === '--rollback') {
    if (rest.length > 2 || rest[1]?.startsWith('-')) return USAGE
    return { mode: 'rollback', version: rest[1], dryRun }
  }
  const [file, flag, version, ...extra] = rest
  if (!file || file.startsWith('-') || extra.length > 0) return USAGE
  if (flag === undefined) return { mode: 'publish', file, dryRun }
  if (flag !== '--version' || !version) return USAGE
  return { mode: 'publish', file, version, dryRun }
}

/** The plan the command asks for. A publish checks the local file first, and
 * a relative path is from `here`. */
function planFor(
  command: Command,
  { here, date, paths }: { here: string; date: Date; paths?: VpsPaths },
): Step[] {
  if (command.mode === 'rollback')
    return databaseRollbackPlan({ version: command.version, paths })
  const file = resolve(here, command.file)
  return databasePublishPlan({
    file,
    size: checkDatabase(file),
    version: command.version ?? versionAt(date),
    paths,
  })
}

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
}) {
  const command = parseArguments(argv)
  if (typeof command === 'string') throw new Error(command)
  const target = command.dryRun ? undefined : targetFrom(env)
  if (typeof target === 'string') throw new Error(target)
  const steps = planFor(command, where)
  if (target) followThePlan({ steps, vps: connect(target), say })
  else print(describePlan(steps))
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
