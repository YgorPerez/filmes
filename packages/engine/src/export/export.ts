// A Pessoa's Notas in another service's file (`filmes/exportar/imdb.py`,
// #286). Each format is a file of this folder that writes the text:
//
// - imdb: the IMDb ratings CSV, the one format the MovieLens import takes.
// - letterboxd: the CSV Letterboxd's importer reads, for her diary.
//
// The result carries the file's text, not a path: the web app and the MCP
// hand it to whoever asked for it.

import { Effect } from 'effect'
import { resolvePerson } from '../people/people.ts'
import type { EngineError } from '../runtime/EngineError.ts'
import type { Environment } from '../runtime/Environment.ts'
import { Sqlite, type SqliteError } from '../sqlite/Sqlite.ts'
import { imdbFile } from './imdb.ts'
import { letterboxdFile } from './letterboxd.ts'
import type { ExportFile, FileWriter } from './file.ts'

export const EXPORT_FORMATS = ['imdb', 'letterboxd'] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

export interface ExportResult extends ExportFile {
  /** The Pessoa's slug. */
  readonly person: string
  readonly format: ExportFormat
}

const FILES: Record<ExportFormat, FileWriter> = {
  imdb: imdbFile,
  letterboxd: letterboxdFile,
}

/** The Notas of the Pessoa named `person` (slug, name or alias), in
 * `format`. */
export const exportRatings = (
  person: string,
  format: ExportFormat,
): Effect.Effect<
  ExportResult,
  EngineError | SqliteError,
  Environment | Sqlite
> =>
  Effect.gen(function* () {
    const { slug } = yield* resolvePerson(person)
    const file = yield* FILES[format](slug)
    return { person: slug, format, ...file }
  })
