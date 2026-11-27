// @vitest-environment jsdom
// The rating screen (#144): one film of the Fila de Notas at a time, a Nota
// of 1 to 10 or "não vi", a draft kept in the browser until Pronto posts it.
import type { RatingQueue } from '@filmes/engine'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { SearchAnswer } from '#/platform/catalog-search'
import { RatingScreen } from './ratings'
import { RATINGS } from './ratings.copy'

const KEY = 'filmes-notas:teo'

const film = (id: string, title: string, year: number) => ({
  id,
  title,
  year,
  genres: [],
  directors: [],
  runtime: null,
})

const QUEUE: RatingQueue = {
  person: 'teo',
  rated: 2,
  films: [
    {
      ...film('tt9000601', 'Pequenos Milagres', 2019),
      genres: ['Comédia'],
      directors: ['Lia Couto'],
      runtime: 96,
    },
    film('tt9000602', 'Casa Cheia', 2021),
    film('tt9000701', 'Deserto Branco', 2015),
  ],
}

const SEARCH: SearchAnswer = {
  query: 'fronteira',
  found: {
    query: 'fronteira',
    films: [
      {
        id: 'tt9000401',
        title: 'Fronteira',
        year: 2008,
        votes: 40000,
        rating: 7.2,
        directors: ['Rui Tavares'],
      },
    ],
    people: [],
    genres: [],
    series: [],
  },
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const card = () => within(screen.getByRole('article'))
const sent = () =>
  Object.fromEntries(
    [
      ...document.querySelectorAll<HTMLInputElement>(
        'form[action="/notas/enviar"] input[type="hidden"]',
      ),
    ].map((input) => [input.name, input.value]),
  )

describe('the rating screen', () => {
  it('shows the first film of the Fila with its directors, year, runtime and genres', () => {
    render(<RatingScreen queue={QUEUE} search={null} />)
    expect(card().getByRole('heading').textContent).toBe('Pequenos Milagres')
    expect(card().getByText('Direção: Lia Couto · 2019 · 1 h 36')).toBeTruthy()
    expect(card().getByText('Comédia')).toBeTruthy()
    expect(
      card()
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Não vi'])
  })

  it('takes a digit key as the Nota, 0 for 10, while the card has the focus', async () => {
    const user = userEvent.setup()
    render(<RatingScreen queue={QUEUE} search={null} />)
    card().getByRole('button', { name: 'Nota 1' }).focus()
    await user.keyboard('8')
    expect(card().getByRole('heading').textContent).toBe('Casa Cheia')
    card().getByRole('button', { name: 'Nota 1' }).focus()
    await user.keyboard('0')
    expect(card().getByRole('heading').textContent).toBe('Deserto Branco')
    expect(sent()).toMatchObject({
      'nota.tt9000601': '8',
      'nota.tt9000602': '10',
    })
  })

  it('a Nota goes to the draft and the next film comes; Pronto posts the draft', async () => {
    const user = userEvent.setup()
    render(<RatingScreen queue={QUEUE} search={null} />)

    await user.click(card().getByRole('button', { name: 'Nota 8' }))

    expect(card().getByRole('heading').textContent).toBe('Casa Cheia')
    expect(
      screen.getAllByText('Pequenos Milagres').at(-1)?.closest('li')
        ?.textContent,
    ).toContain('8')
    expect(sent()).toEqual({ 'nota.tt9000601': '8' })
    expect(screen.getByRole('button', { name: RATINGS.done(1) })).toBeTruthy()
    // What the tap did: said aloud, counted toward ten, the focus on the
    // next film.
    expect(
      screen.getByText(
        RATINGS.announceRated(8, 'Pequenos Milagres', 'Casa Cheia'),
      ),
    ).toBeTruthy()
    expect(screen.getByText(RATINGS.progress(3, 10))).toBeTruthy()
  })
})

describe('the rating screen', () => {
  it('"Voltar ao anterior" brings the last film back, Nota or "Não vi"', async () => {
    const user = userEvent.setup()
    render(<RatingScreen queue={QUEUE} search={null} />)
    await user.click(card().getByRole('button', { name: 'Nota 8' }))
    await user.click(card().getByRole('button', { name: RATINGS.notSeen }))
    expect(card().getByRole('heading').textContent).toBe('Deserto Branco')

    await user.click(
      screen.getByRole('button', { name: RATINGS.undoLabel('Casa Cheia') }),
    )
    expect(card().getByRole('heading').textContent).toBe('Casa Cheia')
    await user.click(
      screen.getByRole('button', {
        name: RATINGS.undoLabel('Pequenos Milagres'),
      }),
    )
    expect(card().getByRole('heading').textContent).toBe('Pequenos Milagres')
    expect(sent()).toEqual({})
  })

  it('at ten, the card waits behind "Mais 10"', async () => {
    const user = userEvent.setup()
    render(<RatingScreen queue={{ ...QUEUE, rated: 9 }} search={null} />)
    await user.click(card().getByRole('button', { name: 'Nota 8' }))

    expect(screen.queryByRole('article')).toBeNull()
    expect(screen.getByText(RATINGS.goal(10))).toBeTruthy()
    await user.click(screen.getByRole('button', { name: RATINGS.more }))
    expect(card().getByRole('heading').textContent).toBe('Casa Cheia')
    expect(screen.getByText(RATINGS.progress(10, 20))).toBeTruthy()
  })
})

describe('the rating screen', () => {
  it('shows the card the route loads: poster, Portuguese title, synopsis', async () => {
    render(
      <RatingScreen
        queue={QUEUE}
        search={null}
        loadCard={(id) =>
          Promise.resolve({
            id,
            title: 'Pequenos Milagres',
            titlePt: 'Milagrinhos',
            year: 2019,
            runtime: 96,
            directors: ['Lia Couto'],
            poster: 'https://image.tmdb.org/t/p/w185/p.jpg',
            synopsis: 'Uma costureira reabre o cinema.',
            attributions: [],
          })
        }
      />,
    )
    expect((await card().findByRole('heading')).textContent).toBe('Milagrinhos')
    expect(
      await card().findByText(RATINGS.original('Pequenos Milagres')),
    ).toBeTruthy()
    expect(card().getByText('Uma costureira reabre o cinema.')).toBeTruthy()
    expect(
      card().getByRole('img', { name: RATINGS.poster('Milagrinhos') }),
    ).toBeTruthy()
  })

  it('"Não vi" moves on with no Nota, and Pronto says it needs one', async () => {
    const fetched = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetched)
    const user = userEvent.setup()
    render(<RatingScreen queue={QUEUE} search={null} />)

    await user.click(card().getByRole('button', { name: RATINGS.notSeen }))

    expect(card().getByRole('heading').textContent).toBe('Casa Cheia')
    expect(sent()).toEqual({})
    await user.click(screen.getByRole('button', { name: RATINGS.done(0) }))
    expect(screen.getByText(RATINGS.nothing)).toBeTruthy()
    expect(fetched).not.toHaveBeenCalled()
  })

  it('a Nota taken back leaves the draft', async () => {
    const user = userEvent.setup()
    render(<RatingScreen queue={QUEUE} search={null} />)
    await user.click(card().getByRole('button', { name: 'Nota 8' }))

    await user.click(
      screen.getByRole('button', { name: RATINGS.remove('Pequenos Milagres') }),
    )

    expect(sent()).toEqual({})
  })
})

describe('the rating screen', () => {
  it('keeps the draft and the films passed over through a reload', async () => {
    const user = userEvent.setup()
    const first = render(<RatingScreen queue={QUEUE} search={null} />)
    await user.click(card().getByRole('button', { name: 'Nota 8' }))
    await user.click(card().getByRole('button', { name: RATINGS.notSeen }))
    first.unmount()

    render(<RatingScreen queue={QUEUE} search={null} />)

    expect(card().getByRole('heading').textContent).toBe('Deserto Branco')
    expect(sent()).toEqual({ 'nota.tt9000601': '8' })
  })

  it('once Pronto wrote them, the sent Notas leave the draft and it says how many', async () => {
    // The post goes on its way and the page reloads before it answers.
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => new Promise<Response>(() => {})),
    )
    const user = userEvent.setup()
    const first = render(<RatingScreen queue={QUEUE} search={null} />)
    await user.click(card().getByRole('button', { name: 'Nota 8' }))
    await user.click(screen.getByRole('button', { name: RATINGS.done(1) }))
    first.unmount()

    render(<RatingScreen queue={QUEUE} search={null} written={1} />)

    expect(screen.getByText(RATINGS.written(1)).getAttribute('role')).toBe(
      'status',
    )
    expect(screen.getByRole('link', { name: RATINGS.ask })).toBeTruthy()
    expect(sent()).toEqual({})
    expect(localStorage.getItem(KEY)).not.toContain('tt9000601"')
  })

  it('a film picked in the search is the one to rate', () => {
    render(<RatingScreen queue={QUEUE} search={SEARCH} film="tt9000401" />)
    expect(card().getByRole('heading').textContent).toBe('Fronteira')
    expect(card().getByText('Direção: Rui Tavares · 2008')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: RATINGS.pickLabel('Fronteira (2008)') }),
    ).toBeTruthy()
  })
})

describe('the rating screen', () => {
  it('says when the Fila is over, and when the engine cannot run', async () => {
    const user = userEvent.setup()
    render(
      <RatingScreen
        queue={{ ...QUEUE, films: QUEUE.films.slice(0, 1) }}
        search={null}
      />,
    )
    await user.click(card().getByRole('button', { name: RATINGS.notSeen }))
    expect(screen.getByText(RATINGS.over)).toBeTruthy()
    cleanup()

    render(<RatingScreen queue={null} search={null} />)
    expect(screen.getByRole('alert').textContent).toContain(RATINGS.unavailable)
  })
})

describe('the rating card, at its edges', () => {
  it('ignores a digit held with a modifier and keys that are no digit', async () => {
    const user = userEvent.setup()
    render(<RatingScreen queue={QUEUE} search={null} />)
    card().getByRole('button', { name: 'Nota 1' }).focus()
    await user.keyboard('{Control>}8{/Control}')
    await user.keyboard('x')
    expect(card().getByRole('heading').textContent).toBe('Pequenos Milagres')
  })

  it('shows a film without a year by its name alone', () => {
    render(
      <RatingScreen
        queue={{
          ...QUEUE,
          films: [{ ...film('tt9000801', 'Sem Data', 2000), year: null }],
        }}
        search={null}
      />,
    )
    expect(card().getByRole('heading').textContent).toBe('Sem Data')
    expect(card().queryByText(/2000/)).toBeNull()
  })

  it('says the next ten once she has more than ten', () => {
    render(
      <RatingScreen
        queue={{ ...QUEUE, rated: 12 }}
        search={null}
        written={3}
      />,
    )
    expect(screen.getByText(RATINGS.writtenNext)).toBeTruthy()
  })
})
