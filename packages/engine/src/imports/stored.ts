// The original files of the imports, kept in filmes-dados (`importar/
// arquivos.py`): `imports/<slug>/<kind>-<sha256>.<ext>`, recorded in the
// Pessoa's `imports:` with the day, the original name and the hash.

import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { Effect } from 'effect'
import { isMapping, pyStrValue, type YamlMapping } from '../data/yaml.ts'
import { savePerson } from '../people/people.ts'
import type { Person } from '../people/Person.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import { Environment } from '../runtime/Environment.ts'
import { Run } from '../runtime/Run.ts'

/** The Pessoa's import records of a kind. */
const recordsOf = (person: Person, kind: string): YamlMapping[] =>
  person.imports.filter(
    (record): record is YamlMapping =>
      isMapping(record) && record.get('kind') === kind,
  )

/** Reads each stored file of the Pessoa's imports of a kind, in the order
 * recorded (`arquivos.registrados`); a recorded file missing from
 * filmes-dados is `invalid_data`. */
export const storedImports = <A>(
  person: Person,
  kind: string,
  read: (path: string, content: Buffer) => Effect.Effect<A, EngineError>,
): Effect.Effect<A[], EngineError, Environment> =>
  Effect.gen(function* () {
    const root = yield* (yield* Environment).path('data')
    const results: A[] = []
    for (const record of recordsOf(person, kind)) {
      const file = pyStrValue(record.get('file') ?? null)
      const path = join(root, file)
      if (!(yield* Effect.sync(() => existsSync(path))))
        return yield* engineError(
          'invalid_data',
          `people/${person.slug}.md registra o import ${file}, que não está no repo de dados`,
        )
      results.push(
        yield* read(path, yield* Effect.sync(() => readFileSync(path))),
      )
    }
    return results
  })

export interface Stored {
  /** The Pessoa with the new record, or as she was. */
  readonly person: Person
  /** Relative to filmes-dados. */
  readonly file: string
  readonly new: boolean
}

/** Keeps the original file and records it in the Pessoa's file
 * (`arquivos.guardar`); the same content of the same kind is kept once. */
export const storeImport = (
  person: Person,
  kind: string,
  original: string,
  content: Uint8Array,
  extension: string,
): Effect.Effect<Stored, EngineError, Environment | Run> =>
  Effect.gen(function* () {
    const sha = createHash('sha256').update(content).digest('hex')
    const same = recordsOf(person, kind).find(
      (record) => record.get('sha256') === sha,
    )
    if (same !== undefined)
      return { person, file: pyStrValue(same.get('file') ?? null), new: false }
    const file = `imports/${person.slug}/${kind}-${sha}.${extension}`
    const root = yield* (yield* Environment).path('data')
    const target = join(root, file)
    yield* Effect.sync(() => {
      mkdirSync(dirname(target), { recursive: true })
      const temporary = `${target}.${process.pid}.tmp`
      try {
        writeFileSync(temporary, content)
        renameSync(temporary, target)
      } finally {
        rmSync(temporary, { force: true })
      }
    })
    const { today } = yield* Run
    const record: YamlMapping = new Map<string, string>([
      ['kind', kind],
      ['file', file],
      ['date', today],
      ['original', original],
      ['sha256', sha],
    ])
    const updated: Person = { ...person, imports: [...person.imports, record] }
    yield* savePerson(updated)
    return { person: updated, file, new: true }
  })

/** A file someone sends to an import. */
export interface Upload {
  /** Its name, without the folder. */
  readonly original: string
  readonly content: Buffer
}

/** Reads a file to import from a path (the CLI's `--letterboxd <zip>`);
 * a missing one is `missing_file`. Online, the upload's bytes come
 * instead. */
export const readUpload = (path: string): Effect.Effect<Upload, EngineError> =>
  Effect.suspend(() =>
    existsSync(path)
      ? Effect.sync(() => ({
          original: basename(path),
          content: readFileSync(path),
        }))
      : Effect.fail(
          engineError('missing_file', `arquivo não encontrado: ${path}`),
        ),
  )
