import {
  exportRatings,
  makeEngine,
  type ErrorCode,
  type Outcome,
} from '@filmes/engine'
import { describe, expect, it, vi } from 'vite-plus/test'
import { useFixture } from '../../../packages/engine/test/fixture.ts'
import {
  csvDownload,
  csvFileName,
  exporterFromEngine,
  type Exporter,
} from './export'
import type { Owner } from './owners'

const BRUNO: Owner = {
  person: 'bruno',
  name: 'Bruno',
  email: 'bruno@example.org',
  admin: false,
}

const CSV =
  'Const,Your Rating,Date Rated,Title\r\ntt0133093,9,2026-01-02,"Matrix, The"\r\n'

const failure = (code: ErrorCode): Outcome<never> => ({
  exitCode: 1,
  output: { error: { code, message: `mensagem de ${code}` } },
})

/** An exporter whose file is `outcome`, for any Pessoa and format. */
function exporter(outcome: Outcome<string>) {
  const asked: string[] = []
  const fake: Exporter = {
    file: async (person, format) => {
      asked.push(`${person} ${format}`)
      return outcome.exitCode === 0
        ? {
            exitCode: 0,
            output: {
              person,
              format,
              ratings: 1,
              outsideCatalog: 0,
              content: outcome.output,
            },
          }
        : outcome
    },
  }
  return { fake, asked }
}

const download = (query: string) =>
  new Request(`http://localhost/exportar/imdb.csv${query}`)

const imdbDownload = (
  request: Request,
  owner: Owner | null,
  exporter: Exporter,
) => csvDownload(request, owner, exporter, 'imdb')

describe('csvDownload', () => {
  it('gives the engine file byte for byte, as an attachment', async () => {
    const { fake, asked } = exporter({ exitCode: 0, output: CSV })
    const response = await imdbDownload(download('?pessoa=bruno'), BRUNO, fake)
    expect(asked).toEqual(['bruno imdb'])
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="filmes-bruno-imdb.csv"',
    )
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.text()).toBe(CSV)
  })

  it('names the Letterboxd file by its format', async () => {
    const { fake, asked } = exporter({ exitCode: 0, output: CSV })
    const response = await csvDownload(
      new Request('http://localhost/exportar/letterboxd.csv?pessoa=iara'),
      BRUNO,
      fake,
      'letterboxd',
    )
    expect(asked).toEqual(['iara letterboxd'])
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="filmes-iara-letterboxd.csv"',
    )
  })

  it('sends whoever is not a Dono to the login, without asking the engine', async () => {
    const { fake, asked } = exporter({ exitCode: 0, output: CSV })
    const response = await imdbDownload(download('?pessoa=bruno'), null, fake)
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe('/entrar')
    expect(asked).toEqual([])
  })

  it.each(['', '?pessoa=', '?pessoa=%20'])(
    'goes back to Pessoas when no Pessoa is chosen (%s)',
    async (query) => {
      const { fake, asked } = exporter({ exitCode: 0, output: CSV })
      const response = await imdbDownload(download(query), BRUNO, fake)
      expect(response.headers.get('Location')).toBe('/pessoas?erro=pessoa')
      expect(asked).toEqual([])
    },
  )

  it('goes back to Pessoas when the Pessoa is gone', async () => {
    const { fake } = exporter(failure('unknown_person'))
    const response = await imdbDownload(download('?pessoa=leo'), BRUNO, fake)
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe('/pessoas?erro=pessoa')
  })

  it('logs any other engine error and goes back to her page saying so', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { fake } = exporter(failure('missing_database'))
      // Her page; the Dono's own redirects on to Meu gosto with the query.
      const own = await imdbDownload(download('?pessoa=bruno'), BRUNO, fake)
      expect(own.headers.get('Location')).toBe('/pessoas/bruno?erro=exportar')
      const other = await imdbDownload(download('?pessoa=iara'), BRUNO, fake)
      expect(other.headers.get('Location')).toBe('/pessoas/iara?erro=exportar')
      expect(log).toHaveBeenCalledWith(
        'engine: missing_database: mensagem de missing_database',
      )
    } finally {
      log.mockRestore()
    }
  })
})

describe('csvFileName', () => {
  it('keeps a slug as it is and replaces what a file name should not have', () => {
    expect(csvFileName('ana-clara', 'imdb')).toBe('filmes-ana-clara-imdb.csv')
    expect(csvFileName('a"b/c', 'imdb')).toBe('filmes-a_b_c-imdb.csv')
    expect(csvFileName('iara', 'letterboxd')).toBe('filmes-iara-letterboxd.csv')
  })
})

describe('on the engine fixture', () => {
  it('downloads exactly what the engine writes', async () => {
    const fixture = useFixture()
    const engine = makeEngine(fixture.vars)
    try {
      const response = await imdbDownload(
        download('?pessoa=Iara'),
        BRUNO,
        exporterFromEngine(engine),
      )
      const file = await fixture.ok(exportRatings('iara', 'imdb'))
      expect(response.headers.get('Content-Disposition')).toBe(
        'attachment; filename="filmes-iara-imdb.csv"',
      )
      expect(await response.text()).toBe(file.content)
      expect(file.ratings).toBe(2)
    } finally {
      await engine.dispose()
    }
  })
})

describe('exporterFromEngine', () => {
  // The happy path runs on the fixture in the e2e (`e2e/export.e2e.ts`).
  it('passes on the error of an engine that cannot start', async () => {
    const engine = makeEngine({})
    try {
      const exporter = exporterFromEngine(engine)
      const file = await exporter.file('bruno', 'imdb')
      expect(file).toMatchObject({
        exitCode: 1,
        output: { error: { code: 'missing_config' } },
      })
    } finally {
      await engine.dispose()
    }
  })
})
