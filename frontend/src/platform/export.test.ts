import {
  exportRatings,
  makeEngine,
  type ErrorCode,
  type Outcome,
} from '@filmes/engine'
import { describe, expect, it, vi } from 'vite-plus/test'
import { useFixture } from '../../../packages/engine/test/fixture.ts'
import { isExportRefusal } from '#/content/export-refusal'
import {
  exportChoices,
  exporterFromEngine,
  imdbDownload,
  imdbFileName,
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

/** An exporter whose IMDb file is `outcome`, for any Pessoa. */
function exporter(outcome: Outcome<string>) {
  const asked: string[] = []
  const fake: Exporter = {
    choices: async () => ({ exitCode: 0, output: [] }),
    imdb: async (person) => {
      asked.push(person)
      return outcome.exitCode === 0
        ? {
            exitCode: 0,
            output: {
              person,
              format: 'imdb',
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

describe('imdbDownload', () => {
  it('gives the engine file byte for byte, as an attachment', async () => {
    const { fake, asked } = exporter({ exitCode: 0, output: CSV })
    const response = await imdbDownload(download('?pessoa=bruno'), BRUNO, fake)
    expect(asked).toEqual(['bruno'])
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="filmes-bruno-imdb.csv"',
    )
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.text()).toBe(CSV)
  })

  it('sends whoever is not a Dono to the login, without asking the engine', async () => {
    const { fake, asked } = exporter({ exitCode: 0, output: CSV })
    const response = await imdbDownload(download('?pessoa=bruno'), null, fake)
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe('/entrar')
    expect(asked).toEqual([])
  })

  it.each(['', '?pessoa=', '?pessoa=%20'])(
    'goes back to the page when no Pessoa is chosen (%s)',
    async (query) => {
      const { fake, asked } = exporter({ exitCode: 0, output: CSV })
      const response = await imdbDownload(download(query), BRUNO, fake)
      expect(response.headers.get('Location')).toBe('/exportar?erro=pessoa')
      expect(asked).toEqual([])
    },
  )

  it('goes back to the page when the Pessoa is gone', async () => {
    const { fake } = exporter(failure('unknown_person'))
    const response = await imdbDownload(download('?pessoa=leo'), BRUNO, fake)
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe('/exportar?erro=pessoa')
  })

  it('logs any other engine error and says the export is unavailable', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { fake } = exporter(failure('missing_database'))
      const response = await imdbDownload(
        download('?pessoa=bruno'),
        BRUNO,
        fake,
      )
      expect(response.headers.get('Location')).toBe(
        '/exportar?erro=indisponivel',
      )
      expect(log).toHaveBeenCalledWith(
        'engine: missing_database: mensagem de missing_database',
      )
    } finally {
      log.mockRestore()
    }
  })
})

describe('imdbFileName', () => {
  it('keeps a slug as it is and replaces what a file name should not have', () => {
    expect(imdbFileName('ana-clara')).toBe('filmes-ana-clara-imdb.csv')
    expect(imdbFileName('a"b/c')).toBe('filmes-a_b_c-imdb.csv')
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

  it('offers every Pessoa with her Notas counted, the Dono chosen', async () => {
    const fixture = useFixture()
    const engine = makeEngine(fixture.vars)
    try {
      const choices = await exportChoices(BRUNO, exporterFromEngine(engine))
      expect(choices?.selected).toBe('bruno')
      expect(choices?.people.map((p) => p.person)).toEqual([
        'bruno',
        'iara',
        'quim',
        'rosa',
        'teo',
        'vera',
      ])
      expect(choices?.people.find((p) => p.person === 'quim')).toEqual({
        person: 'quim',
        name: 'Quim',
        ratings: 4,
      })
    } finally {
      await engine.dispose()
    }
  })

  it('has no choices, and logs why, when the database is missing', async () => {
    const fixture = useFixture()
    const engine = makeEngine({
      ...fixture.vars,
      FILMES_BANCO: `${fixture.root}/none.sqlite`,
    })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(await exportChoices(BRUNO, exporterFromEngine(engine))).toBeNull()
      expect(log).toHaveBeenCalledWith(
        expect.stringMatching(/^engine: missing_database: /),
      )
    } finally {
      log.mockRestore()
      await engine.dispose()
    }
  })
})

describe('isExportRefusal', () => {
  it('takes only the reasons the page knows', () => {
    expect(isExportRefusal('pessoa')).toBe(true)
    expect(isExportRefusal('outra')).toBe(false)
    expect(isExportRefusal(undefined)).toBe(false)
  })
})

describe('exporterFromEngine', () => {
  // The happy path runs on the fixture in the e2e (`e2e/export.e2e.ts`).
  it('passes on the error of an engine that cannot start', async () => {
    const engine = makeEngine({})
    try {
      const exporter = exporterFromEngine(engine)
      const choices = await exporter.choices()
      const file = await exporter.imdb('bruno')
      expect(choices).toMatchObject({
        exitCode: 1,
        output: { error: { code: 'missing_config' } },
      })
      expect(file).toMatchObject({
        exitCode: 1,
        output: { error: { code: 'missing_config' } },
      })
    } finally {
      await engine.dispose()
    }
  })
})
