// Export (map #72, W6): a Pessoa's Notas as the IMDb ratings CSV, the file
// the MovieLens import takes. The engine writes the file
// (`exportRatings`); this hands it to the browser as a download, from the
// Notas section of her page (#222). Server only.

import {
  exportRatings,
  type Engine,
  type ErrorOutput,
  type ExportResult,
  type Outcome,
} from '@filmes/engine'
import { currentOwner } from './auth'
import { appEngine } from './engine'
import type { Owner } from './owners'

/** What the download needs from the engine. */
export interface Exporter {
  /** The IMDb CSV of the Pessoa with this slug. */
  imdb(person: string): Promise<Outcome<ExportResult>>
}

export function exporterFromEngine(engine: Engine): Exporter {
  return { imdb: (person) => engine.run(exportRatings(person, 'imdb')) }
}

/** An engine error the Dono cannot fix from the page goes to the server log
 * (`docker logs`), so whoever runs the server sees why. */
function logEngineError(outcome: { output: ErrorOutput }): void {
  const { code, message } = outcome.output.error
  console.error(`engine: ${code}: ${message}`)
}

/** The file's name on the Dono's disk. */
export const imdbFileName = (person: string) =>
  `filmes-${person.replace(/[^\w-]/g, '_')}-imdb.csv`

const back = (location: string) =>
  new Response(null, {
    status: 303,
    headers: { Location: location, 'Cache-Control': 'private, no-store' },
  })

/** No Pessoa to go back to: Pessoas says she is gone. */
const gone = () => back('/pessoas?erro=pessoa')

/** `GET /exportar/imdb.csv?pessoa=<slug>`: the file, as the engine wrote it,
 * byte for byte. Only a Dono gets it (the page gate does not cover this
 * route). A Pessoa that is gone goes back to Pessoas; any other failure, to
 * her page, which says the file did not come. */
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
  if (!person) return gone()
  const file = await exporter.imdb(person)
  if (file.exitCode !== 0) {
    if (file.output.error.code === 'unknown_person') return gone()
    logEngineError(file)
    // Her page; the Dono's own goes on to Meu gosto with the query.
    return back(`/pessoas/${encodeURIComponent(person)}?erro=exportar`)
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
