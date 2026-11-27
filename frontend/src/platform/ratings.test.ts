// The rating screen (#144) on the real engine fixture: the Fila de Notas the
// page shows, and "Pronto", which writes the draft's Notas in one go.
import { makeEngine } from '@filmes/engine'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vite-plus/test'
import { useFixture } from '../../../packages/engine/test/fixture.ts'
import { parseRatings } from '#/content/rating-form'
import {
  filmCardOf,
  rateAction,
  ratingQueuePage,
  ratingsFromEngine,
  type Rater,
} from './ratings'

const TEO: Rater = { person: 'teo', name: 'Teo', email: 'teo@example.org' }

const ORIGIN = 'http://localhost'

const post = (fields: Record<string, string>, origin = ORIGIN) => {
  const body = new FormData()
  for (const [name, value] of Object.entries(fields)) body.set(name, value)
  return new Request(`${ORIGIN}/notas/enviar`, {
    method: 'POST',
    body,
    headers: { origin },
  })
}

const withRatings = async <A>(
  vars: Record<string, string | undefined>,
  task: (ratings: ReturnType<typeof ratingsFromEngine>) => Promise<A>,
) => {
  const engine = makeEngine(vars)
  try {
    return await task(ratingsFromEngine(engine))
  } finally {
    await engine.dispose()
  }
}

describe('the Fila de Notas page', () => {
  it('gives the logged-in Dono her Fila, and null when the engine cannot run', async () => {
    const fixture = useFixture()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const queue = await withRatings(fixture.vars, (r) =>
        ratingQueuePage(TEO, r),
      )
      const missing = await withRatings(
        { ...fixture.vars, FILMES_BANCO: `${fixture.root}/none.sqlite` },
        (r) => ratingQueuePage(TEO, r),
      )

      expect(queue?.person).toBe('teo')
      expect(queue?.films.slice(0, 2).map((f) => f.title)).toEqual([
        'Pequenos Milagres',
        'Casa Cheia',
      ])
      expect(missing).toBeNull()
      expect(log).toHaveBeenCalledWith(
        expect.stringMatching(/^engine: missing_database: /),
      )
    } finally {
      log.mockRestore()
    }
  })
})

describe('the film card', () => {
  it("gives a film's directors and runtime, and null for one out of the Catálogo", async () => {
    const fixture = useFixture()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const card = await withRatings(fixture.vars, (r) =>
        filmCardOf('tt9000601', TEO, r),
      )
      const none = await withRatings(fixture.vars, (r) =>
        filmCardOf('tt0000001', TEO, r),
      )

      expect(card).toMatchObject({ title: 'Pequenos Milagres', runtime: 96 })
      expect(none).toBeNull()
    } finally {
      log.mockRestore()
    }
  })
})

describe('Pronto', () => {
  it('writes the Notas to the logged-in Dono and says how many', async () => {
    const fixture = useFixture()

    const response = await withRatings(fixture.vars, (r) =>
      rateAction(
        post({ 'nota.tt9000601': '8', 'nota.tt9000701': '3' }),
        TEO,
        r,
        ORIGIN,
      ),
    )

    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe('/meu-gosto/notas?feito=2')
    const file = readFileSync(join(fixture.data, 'people', 'teo.md'), 'utf8')
    expect(file).toContain('Pequenos Milagres')
    expect(file).toContain('Deserto Branco')
  })

  it('refuses a film out of the Catálogo, and goes to the login without a Dono', async () => {
    const fixture = useFixture()

    const unknown = await withRatings(fixture.vars, (r) =>
      rateAction(post({ 'nota.tt1': '8' }), TEO, r, ORIGIN),
    )
    const nobody = await withRatings(fixture.vars, (r) =>
      rateAction(post({ 'nota.tt9000601': '8' }), null, r, ORIGIN),
    )
    const elsewhere = await withRatings(fixture.vars, (r) =>
      rateAction(
        post({ 'nota.tt9000601': '8' }, 'https://evil.example'),
        TEO,
        r,
        ORIGIN,
      ),
    )

    expect(unknown.headers.get('Location')).toBe('/meu-gosto/notas?erro=alvo')
    expect(nobody.headers.get('Location')).toBe('/entrar')
    expect(elsewhere.status).toBe(403)
  })

  it('refuses a form with no Nota or one off the scale before the engine', async () => {
    const fixture = useFixture()

    const empty = await withRatings(fixture.vars, (r) =>
      rateAction(post({}), TEO, r, ORIGIN),
    )

    expect(empty.headers.get('Location')).toBe('/meu-gosto/notas?erro=pedido')
  })
})

describe('the form of Pronto', () => {
  it('reads one Nota of 1 to 10 per film', () => {
    const form = new FormData()
    form.set('nota.tt9000601', '8')
    form.set('nota.tt9000701', ' 10 ')
    expect(parseRatings(form)).toEqual([
      { film: 'tt9000601', rating: 8 },
      { film: 'tt9000701', rating: 10 },
    ])
  })

  it('refuses none, a Nota off the scale, and a field that is not a film', () => {
    const of = (fields: Record<string, string>) => {
      const form = new FormData()
      for (const [name, value] of Object.entries(fields)) form.set(name, value)
      return parseRatings(form)
    }
    expect(of({})).toBeNull()
    expect(of({ 'nota.tt9000601': '11' })).toBeNull()
    expect(of({ 'nota.tt9000601': '4,5' })).toBeNull()
    expect(of({ 'nota.Q9': '8' })).toBeNull()
  })
})
