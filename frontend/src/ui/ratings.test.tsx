// @vitest-environment jsdom
// The rating screen (#144): one film of the Fila de Notas at a time, a Nota
// of 1 to 10 or "não vi", a draft kept in the browser until Pronto posts it.
import type { RatingQueue } from '@filmes/engine'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'
import type { SearchAnswer } from '#/platform/catalog-search'
import { RatingScreen } from './ratings'
import { RATINGS } from './ratings.copy'

const KEY = 'filmes-notas:teo'

const QUEUE: RatingQueue = {
  person: 'teo',
  films: [
    {
      id: 'tt9000601',
      title: 'Pequenos Milagres',
      year: 2019,
      genres: ['Comédia'],
    },
    { id: 'tt9000602', title: 'Casa Cheia', year: 2021, genres: [] },
    { id: 'tt9000701', title: 'Deserto Branco', year: 2015, genres: [] },
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
afterEach(cleanup)

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
  it('shows the first film of the Fila with its year and genres', () => {
    render(<RatingScreen queue={QUEUE} search={null} />)
    expect(card().getByRole('heading').textContent).toBe('Pequenos Milagres')
    expect(card().getByText('2019 · Comédia')).toBeTruthy()
    expect(
      card()
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Não vi'])
  })

  it('a Nota goes to the draft and the next film comes; Pronto posts the draft', async () => {
    const user = userEvent.setup()
    render(<RatingScreen queue={QUEUE} search={null} />)

    await user.click(card().getByRole('button', { name: 'Nota 8' }))

    expect(card().getByRole('heading').textContent).toBe('Casa Cheia')
    expect(
      screen.getByText('Pequenos Milagres').closest('li')?.textContent,
    ).toContain('8')
    expect(sent()).toEqual({ 'nota.tt9000601': '8' })
    expect(screen.getByRole('button', { name: RATINGS.done(1) })).toBeTruthy()
  })

  it('"Não vi" moves on with no Nota, and Pronto waits for one', async () => {
    const user = userEvent.setup()
    render(<RatingScreen queue={QUEUE} search={null} />)

    await user.click(card().getByRole('button', { name: RATINGS.notSeen }))

    expect(card().getByRole('heading').textContent).toBe('Casa Cheia')
    expect(sent()).toEqual({})
    expect(
      (
        screen.getByRole('button', {
          name: RATINGS.done(0),
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
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
    const user = userEvent.setup()
    const first = render(<RatingScreen queue={QUEUE} search={null} />)
    await user.click(card().getByRole('button', { name: 'Nota 8' }))
    await user.click(screen.getByRole('button', { name: RATINGS.done(1) }))
    first.unmount()

    render(<RatingScreen queue={QUEUE} search={null} written={1} />)

    expect(screen.getByRole('status').textContent).toBe(RATINGS.written(1))
    expect(sent()).toEqual({})
    expect(localStorage.getItem(KEY)).not.toContain('tt9000601"')
  })

  it('a film picked in the search is the one to rate', () => {
    render(<RatingScreen queue={QUEUE} search={SEARCH} film="tt9000401" />)
    expect(card().getByRole('heading').textContent).toBe('Fronteira')
    expect(card().getByText('2008 · Rui Tavares')).toBeTruthy()
  })

  it('says when the Fila is over, and when the engine cannot run', async () => {
    const user = userEvent.setup()
    render(
      <RatingScreen
        queue={{ person: 'teo', films: QUEUE.films.slice(0, 1) }}
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
