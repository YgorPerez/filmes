// Export (map #72, W6): a Pessoa's Notas as the IMDb ratings CSV, the file
// the MovieLens import takes. The engine writes the file
// (`exportRatings`); this hands it to the browser as a download and lists
// whose Notas the page offers. Server only.

import {
  exportRatings,
  readPeople,
  type Engine,
  type ErrorOutput,
  type ExportResult,
  type Outcome,
} from '@filmes/engine'
import type { ExportRefusal } from '#/content/export-refusal'
import { EXPORT_PATH } from '#/content/paths'
import { currentOwner } from './auth'
import { appEngine } from './engine'
import type { Owner } from './owners'

/** A Pessoa the page offers, with how many Notas her file would have. */
export type ExportChoice = { person: string; name: string; ratings: number }

/** What the screen and the download need from the engine. */
export interface Exporter {
  /** Every Pessoa, in the engine's order, with her Notas counted. */
  choices(): Promise<Outcome<ExportChoice[]>>
  /** The IMDb CSV of the Pessoa with this slug. */
  imdb(person: string): Promise<Outcome<ExportResult>>
}

export function exporterFromEngine(engine: Engine): Exporter {
  const imdb = (person: string) => engine.run(exportRatings(person, 'imdb'))
  return {
    imdb,
    async choices() {
      const people = await engine.run(readPeople)
      if (people.exitCode !== 0) return people
      const choices: ExportChoice[] = []
      for (const { slug, name } of people.output) {
        const file = await imdb(slug)
        if (file.exitCode !== 0) return file
        choices.push({ person: slug, name, ratings: file.output.ratings })
      }
      return { exitCode: 0, output: choices }
    },
  }
}

/** An engine error the Dono cannot fix from the page goes to the server log
 * (`docker logs`), so whoever runs the server sees why. */
function logEngineError(outcome: { output: ErrorOutput }): void {
  const { code, message } = outcome.output.error
  console.error(`engine: ${code}: ${message}`)
}

/** What the export page (`EXPORT_PATH`) shows: every Pessoa with her Notas counted, the
 * logged-in Dono's own chosen when the page opens; `null` when the engine
 * cannot run here (no database yet), with the reason in the server log. */
export async function exportChoices(
  owner: Owner,
  exporter: Exporter,
): Promise<{ people: ExportChoice[]; selected: string } | null> {
  const choices = await exporter.choices()
  if (choices.exitCode !== 0) {
    logEngineError(choices)
    return null
  }
  return { people: choices.output, selected: owner.person }
}

/** The file's name on the Dono's disk. */
export const imdbFileName = (person: string) =>
  `filmes-${person.replace(/[^\w-]/g, '_')}-imdb.csv`

const refused = (refusal: ExportRefusal) =>
  new Response(null, {
    status: 303,
    headers: {
      Location: `${EXPORT_PATH}?erro=${refusal}`,
      'Cache-Control': 'private, no-store',
    },
  })

/** `GET /exportar/imdb.csv?pessoa=<slug>`: the file, as the engine wrote it,
 * byte for byte. Only a Dono gets it (the page gate does not cover this
 * route); a failure goes back to the page with the reason. */
export async function imdbDownload(
  request: Request,
  owner: Owner | null,
  exporter: Exporter,
): Promise<Response> {
  if (!owner)
    return new Response(null, {
      status: 303,
      headers: { Location: '/entrar', 'Cache-Control': 'no-store' },
    })
  const person = new URL(request.url).searchParams.get('pessoa')?.trim()
  if (!person) return refused('pessoa')
  const file = await exporter.imdb(person)
  if (file.exitCode !== 0) {
    if (file.output.error.code === 'unknown_person') return refused('pessoa')
    logEngineError(file)
    return refused('indisponivel')
  }
  return new Response(file.output.content, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${imdbFileName(file.output.person)}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

/** The app's download: the logged-in Dono, the process's engine. */
export const serveImdbDownload = (request: Request) =>
  imdbDownload(request, currentOwner(request), exporterFromEngine(appEngine()))

/** The app's choices for the logged-in Dono. */
export const choicesFor = (owner: Owner) =>
  exportChoices(owner, exporterFromEngine(appEngine()))
