// Migrates a whole filmes-dados checkout or `config/` folder into a new
// folder, in either direction. The source is only read: the script never
// writes next to it, and refuses a destination inside it (ADR 0002: cutover
// runs it once and commits the result by hand).

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { normalizeLegacy } from './legacy.ts'
import { invertToml, rewriteToml } from './rewrite-toml.ts'
import { MigrationError } from './error.ts'
import { rewriteMarkdown, rewriteYaml } from './rewrite-yaml.ts'
import { invert, type Shape } from './shape.ts'
import { CONFIG_FILES, type ConfigFile } from './tables/config.ts'
import {
  letterboxdResolutions,
  person,
  session,
  type DataKind,
} from './tables/data.ts'

export type Direction = 'to-en' | 'to-pt'

export interface FileResult {
  /** Path in the source, relative to it. */
  readonly from: string
  /** Path in the destination, relative to it. */
  readonly to: string
  /** `rewritten`: keys renamed; `copied`: kept byte for byte (an uploaded
   * export, a file this script has no table for). */
  readonly action: 'rewritten' | 'copied'
}

const DATA_SHAPES: Readonly<Record<DataKind, Shape>> = {
  person,
  session,
  letterboxd: letterboxdResolutions,
}

/** Top-level folders of filmes-dados, Portuguese → English. `imports/`
 * keeps its name. */
const DATA_FOLDERS: Readonly<Record<string, string>> = {
  pessoas: 'people',
  sessoes: 'sessions',
}

const LETTERBOXD = 'imports/letterboxd.md'

function listFiles(root: string): string[] {
  const out: string[] = []
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git') continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile())
        out.push(relative(root, path).split(sep).join('/'))
    }
  }
  visit(root)
  return out.sort()
}

function prepareDestination(source: string, destination: string): void {
  const src = resolve(source)
  const dst = resolve(destination)
  if (!existsSync(src)) throw new MigrationError(`${source} does not exist`)
  if (dst === src || dst.startsWith(src + sep) || src.startsWith(dst + sep))
    throw new MigrationError(
      'the destination must be outside the source, and the source outside it',
    )
  if (existsSync(dst) && readdirSync(dst).length > 0)
    throw new MigrationError(`${destination} is not empty`)
  mkdirSync(dst, { recursive: true })
}

function write(root: string, path: string, content: Buffer | string): void {
  const full = join(root, path)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content)
}

/** Whether a filmes-dados folder is already in `direction`'s target
 * language: it has a target folder (`people/`, `sessions/` for to-en) and
 * none of the source ones. */
function alreadyIn(source: string, direction: Direction): boolean {
  const pt = Object.keys(DATA_FOLDERS)
  const en = Object.values(DATA_FOLDERS)
  const [from, to] = direction === 'to-en' ? [pt, en] : [en, pt]
  const has = (name: string) => existsSync(join(source, name))
  return to.some(has) && !from.some(has)
}

/** Where a filmes-dados file goes, and which table rewrites it. */
function dataTarget(
  path: string,
  direction: Direction,
): { to: string; kind: DataKind | null } {
  const folders =
    direction === 'to-en'
      ? DATA_FOLDERS
      : Object.fromEntries(Object.entries(DATA_FOLDERS).map(([a, b]) => [b, a]))
  if (path === LETTERBOXD) return { to: path, kind: 'letterboxd' }
  const [top, ...rest] = path.split('/')
  const renamed = top !== undefined ? folders[top] : undefined
  if (renamed === undefined || rest.length === 0)
    return { to: path, kind: null }
  const to = [renamed, ...rest].join('/')
  if (rest.length !== 1 || !path.endsWith('.md')) return { to, kind: null }
  const ptTop = direction === 'to-en' ? top : renamed
  return { to, kind: ptTop === 'pessoas' ? 'person' : 'session' }
}

/** Where a path inside filmes-dados (`sessoes/x.md`, or the folder
 * `pessoas` alone) lands after the migration. */
export function migrateDataPath(path: string, direction: Direction): string {
  const [top, ...rest] = path.split('/')
  if (rest.length > 0) return dataTarget(path, direction).to
  const folders =
    direction === 'to-en'
      ? DATA_FOLDERS
      : Object.fromEntries(Object.entries(DATA_FOLDERS).map(([a, b]) => [b, a]))
  return (top !== undefined && folders[top]) || path
}

/** One filmes-dados Markdown file, migrated. */
export function migrateDataFile(
  kind: DataKind,
  text: string,
  direction: Direction,
): string {
  const shape = DATA_SHAPES[kind]
  return direction === 'to-en'
    ? rewriteMarkdown(normalizeLegacy(kind, text), shape)
    : rewriteMarkdown(text, invert(shape))
}

/** Every file of a filmes-dados checkout, migrated into `destination`. */
export function migrateData(
  source: string,
  destination: string,
  direction: Direction,
): FileResult[] {
  prepareDestination(source, destination)
  // A folder already in the target language (filmes-dados after cutover,
  // read by `db:publish --build`) is copied as is: only the folder names
  // tell the language, and `imports/letterboxd.md` keeps its path.
  const done = alreadyIn(source, direction)
  return listFiles(source).map((from) => {
    const { to, kind } = done
      ? { to: from, kind: null }
      : dataTarget(from, direction)
    const bytes = readFileSync(join(source, from))
    if (kind === null) {
      write(destination, to, bytes)
      return { from, to, action: 'copied' }
    }
    try {
      write(
        destination,
        to,
        migrateDataFile(kind, bytes.toString('utf8'), direction),
      )
    } catch (error) {
      throw new MigrationError(`${from}: ${(error as Error).message}`)
    }
    return { from, to, action: 'rewritten' }
  })
}

function configFile(
  name: string,
  direction: Direction,
): (ConfigFile & { readonly from: string }) | undefined {
  if (direction === 'to-en') {
    const file = CONFIG_FILES[name]
    return file && { ...file, from: name }
  }
  for (const [pt, file] of Object.entries(CONFIG_FILES))
    if (file.name === name)
      return file.kind === 'toml'
        ? { kind: 'toml', name: pt, shape: invertToml(file.shape), from: name }
        : { kind: 'json', name: pt, shape: invert(file.shape), from: name }
  return undefined
}

/** One `config/` file, migrated: its new name and text, or `undefined` when
 * the script has no table for it. */
export function migrateConfigFile(
  name: string,
  text: string,
  direction: Direction,
): { name: string; text: string } | undefined {
  const file = configFile(name, direction)
  if (!file) return undefined
  try {
    return {
      name: file.name,
      text:
        file.kind === 'toml'
          ? rewriteToml(text, file.shape)
          : rewriteYaml(text, file.shape, '1.2'),
    }
  } catch (error) {
    throw new MigrationError(`${name}: ${(error as Error).message}`)
  }
}

/** The files of a `config/` folder (not its subfolders), migrated into
 * `destination`. */
export function migrateConfig(
  source: string,
  destination: string,
  direction: Direction,
): FileResult[] {
  prepareDestination(source, destination)
  return readdirSync(source, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .sort()
    .map((from) => {
      const bytes = readFileSync(join(source, from))
      const migrated = migrateConfigFile(
        from,
        bytes.toString('utf8'),
        direction,
      )
      if (!migrated) {
        write(destination, from, bytes)
        return { from, to: from, action: 'copied' }
      }
      write(destination, migrated.name, migrated.text)
      return { from, to: migrated.name, action: 'rewritten' }
    })
}

/** What a source folder is: a filmes-dados checkout or a `config/`. */
export type SourceKind = 'data' | 'config'

/** The migration of a whole folder of that kind. */
export function migrateFolder(
  kind: SourceKind,
): (source: string, destination: string, direction: Direction) => FileResult[] {
  return kind === 'data' ? migrateData : migrateConfig
}

export interface RoundTrip {
  /** Files that came back byte for byte. */
  readonly identical: readonly string[]
  /** Files that came back in the current shape of an older one they had
   * (see `legacy.ts`): equal to the original once that is normalized. */
  readonly normalized: readonly string[]
  /** Files that came back different: the migration is not safe for them. */
  readonly different: readonly string[]
  /** Files the English side has, by their English path. */
  readonly english: readonly FileResult[]
}

function compare(
  source: string,
  back: string,
  normalize: (path: string, text: string) => string,
): Omit<RoundTrip, 'english'> {
  const identical: string[] = []
  const normalized: string[] = []
  const different: string[] = []
  const returned = new Set(listFiles(back))
  for (const path of listFiles(source)) {
    if (!returned.delete(path)) {
      different.push(path)
      continue
    }
    const a = readFileSync(join(source, path))
    const b = readFileSync(join(back, path))
    if (a.equals(b)) identical.push(path)
    else if (normalize(path, a.toString('utf8')) === b.toString('utf8'))
      normalized.push(path)
    else different.push(path)
  }
  different.push(...returned)
  return { identical, normalized, different }
}

/** PT → EN → PT over copies in a temporary folder; `source` is only read.
 * `kind` says whether it is a filmes-dados checkout or a `config/`. */
export function roundTrip(source: string, kind: SourceKind): RoundTrip {
  const work = mkdtempSync(join(tmpdir(), 'filmes-key-migration-'))
  try {
    const en = join(work, 'en')
    const back = join(work, 'pt')
    const run = migrateFolder(kind)
    const english = run(source, en, 'to-en')
    run(en, back, 'to-pt')
    const normalize = (path: string, text: string) => {
      const target = kind === 'data' ? dataTarget(path, 'to-en').kind : null
      return target ? normalizeLegacy(target, text) : text
    }
    return { ...compare(source, back, normalize), english }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
