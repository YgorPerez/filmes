// @vitest-environment jsdom
// The resolution queue as the Dono works it: what each card says, and what
// each form posts (`parseQueue`, the same reader the route uses).
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import {
  parseQueue,
  QUEUE_NOTICES,
  QUEUE_REFUSALS,
} from '#/content/import-action'
import type { QueuePage } from '#/platform/imports'
import { QUEUE } from './queue.copy'
import { QueueScreen } from './queue'

afterEach(cleanup)

const QUEUE_PAGE: QueuePage = {
  items: [
    {
      id: 'filme-perdido-2001-91d7fc73cdee',
      name: 'Filme Perdido',
      year: 2001,
      reason: 'nem o Wikidata nem o TMDB acharam o filme',
      people: ['quim', 'olga'],
      candidates: [],
    },
    {
      id: 'vento-norte-2020-e2bf439e1af6',
      name: 'Vento Norte',
      year: 2020,
      reason: 'o TMDB achou mais de um filme com esse título',
      people: ['quim'],
      candidates: [
        {
          tmdb: '9102',
          title: 'Vento Norte',
          originalTitle: null,
          year: 2020,
          link: 'https://www.themoviedb.org/movie/9102',
          poster: 'https://image.tmdb.org/t/p/w185/v.jpg',
          overview: 'Um faroleiro e a filha esperam o vento.',
          directors: ['Helena Prado'],
          runtime: 104,
          countries: ['BR'],
          language: null,
        },
        {
          tmdb: '9103',
          title: 'Vento Norte',
          originalTitle: 'Nordwind',
          year: 2020,
          link: 'https://www.themoviedb.org/movie/9103',
          poster: null,
          overview: null,
          directors: ['Jonas Weber'],
          runtime: 88,
          countries: ['DE', 'DK'],
          language: 'de',
        },
      ],
    },
  ],
  names: { quim: 'Quim' },
  attributions: [
    {
      source: 'TMDB',
      text: 'This product uses the TMDB API but is not endorsed or certified by TMDB.',
    },
  ],
}

const card = (title: string) => screen.getByRole('region', { name: title })

/** The form's action as the server reads it, sent by `submitter`. */
const posted = (form: HTMLElement, submitter?: HTMLElement) => {
  expect(form).toBeInstanceOf(HTMLFormElement)
  const element = form as HTMLFormElement
  expect(element.method).toBe('post')
  expect(new URL(element.action).pathname).toBe('/fila/acao')
  const data = new FormData(element)
  if (submitter instanceof HTMLButtonElement && submitter.name)
    data.set(submitter.name, submitter.value)
  return parseQueue(data)
}

describe('QueueScreen', () => {
  it('shows each film, why it waits and whose taste it counts in', () => {
    render(<QueueScreen queue={QUEUE_PAGE} />)
    const lost = card('Filme Perdido (2001)')
    expect(lost.textContent).toContain(
      'nem o Wikidata nem o TMDB acharam o filme',
    )
    // A Pessoa the list does not name shows by her slug.
    expect(lost.textContent).toContain(QUEUE.stake(['Quim', 'olga']))
    expect(within(lost).queryByText(QUEUE.candidates)).toBeNull()
    const wind = card('Vento Norte (2020)')
    expect(within(wind).getByText(QUEUE.candidates)).toBeTruthy()
    expect(within(wind).getByText(QUEUE.original('Nordwind'))).toBeTruthy()
    // The twins told apart: a poster and a synopsis.
    expect(
      within(wind).getByRole('img', {
        name: QUEUE.poster('Vento Norte (2020)'),
      }),
    ).toBeTruthy()
    expect(
      within(wind).getByText('Um faroleiro e a filha esperam o vento.'),
    ).toBeTruthy()
    expect(
      within(wind)
        .getAllByRole('link', { name: 'Vento Norte (2020)' })
        .map((a) => a.getAttribute('href')),
    ).toEqual([
      'https://www.themoviedb.org/movie/9102',
      'https://www.themoviedb.org/movie/9103',
    ])
    expect(screen.getByText(QUEUE.attribution)).toBeTruthy()
    // The twins told apart by director, runtime and country; the German
    // synopsis is not shown (#274).
    expect(wind.textContent).toContain(
      'Direção: Helena Prado · 1 h 44 · Brasil',
    )
    expect(wind.textContent).toContain(QUEUE.noOverview)
  })

  it('confirms a film with one of TMDB’s suggestions', () => {
    render(<QueueScreen queue={QUEUE_PAGE} />)
    const button = within(card('Vento Norte (2020)')).getByRole('button', {
      name: QUEUE.pickLabel(
        'Vento Norte (2020)',
        'Direção: Jonas Weber · 1 h 28 · Alemanha, Dinamarca · em alemão',
      ),
    })
    // One orange button: the first suggestion of the first card (#274).
    expect(button.className).not.toContain('bg-sticker-orange')
    expect(posted(button.closest('form') as HTMLElement)).toEqual({
      kind: 'confirm',
      id: 'vento-norte-2020-e2bf439e1af6',
      film: 'https://www.themoviedb.org/movie/9103',
    })
  })
})

describe('QueueScreen, confirming by hand and taking out', () => {
  it('confirms a film by the tconst or link the Dono types', async () => {
    render(<QueueScreen queue={QUEUE_PAGE} />)
    const user = userEvent.setup()
    const form = within(card('Filme Perdido (2001)')).getByRole('form', {
      name: 'Confirmar Filme Perdido (2001)',
    })
    await user.type(
      within(form).getByLabelText(QUEUE.film, { exact: false }),
      'https://www.imdb.com/title/tt9000303/',
    )
    expect(posted(form)).toEqual({
      kind: 'confirm',
      id: 'filme-perdido-2001-91d7fc73cdee',
      film: 'https://www.imdb.com/title/tt9000303/',
    })
  })

  it('takes a film out with one of the reasons, one button each', () => {
    render(<QueueScreen queue={QUEUE_PAGE} />)
    const lost = card('Filme Perdido (2001)')
    const form = within(lost).getByRole('form', {
      name: `${QUEUE.discard}: Filme Perdido (2001)`,
    })
    const [notFilm, ignore] = QUEUE.reasons
    expect(
      posted(
        form,
        within(form).getByRole('button', {
          name: QUEUE.reasonLabel(notFilm.label, 'Filme Perdido (2001)'),
        }),
      ),
    ).toEqual({
      kind: 'discard',
      id: 'filme-perdido-2001-91d7fc73cdee',
      reason: 'não é filme',
    })
    expect(
      posted(
        form,
        within(form).getByRole('button', {
          name: QUEUE.reasonLabel(ignore.label, 'Filme Perdido (2001)'),
        }),
      ),
    ).toEqual({
      kind: 'discard',
      id: 'filme-perdido-2001-91d7fc73cdee',
      reason: 'ignorar',
    })
  })
})

describe('QueueScreen, the Catálogo search', () => {
  it('finds another title in the Catálogo and confirms it with one tap', () => {
    render(
      <QueueScreen
        queue={QUEUE_PAGE}
        search={{
          item: 'filme-perdido-2001-91d7fc73cdee',
          answer: {
            query: 'perdido',
            found: {
              query: 'perdido',
              films: [
                {
                  id: 'tt9000303',
                  title: 'O Filme Perdido',
                  year: 2001,
                  votes: 3000,
                  rating: 7.1,
                  directors: ['Ana Reis'],
                },
              ],
              people: [],
              genres: [],
              series: [],
            },
          },
        }}
      />,
    )
    const lost = card('Filme Perdido (2001)')
    const search = within(lost).getByRole('search', {
      name: QUEUE.searchLabel('Filme Perdido (2001)'),
    }) as HTMLFormElement
    expect(new URL(search.action).pathname).toBe('/meu-gosto/fila')
    expect(new FormData(search).get('para')).toBe(
      'filme-perdido-2001-91d7fc73cdee',
    )
    const button = within(lost).getByRole('button', {
      name: QUEUE.pickLabel('O Filme Perdido (2001)', 'Ana Reis'),
    })
    expect(posted(button.closest('form') as HTMLElement)).toEqual({
      kind: 'confirm',
      id: 'filme-perdido-2001-91d7fc73cdee',
      film: 'tt9000303',
    })
  })
})

describe('QueueScreen, decisions and notices', () => {
  it('names the film decided and takes the decision back', () => {
    render(
      <QueueScreen
        queue={QUEUE_PAGE}
        done={{
          notice: 'confirmado',
          item: 'vento-norte-2020-e2bf439e1af6',
          title: 'Vento Norte (2020)',
        }}
      />,
    )
    expect(screen.getByRole('status').textContent).toBe(
      QUEUE.notices.confirmado('Vento Norte (2020)'),
    )
    const undo = screen.getByRole('button', {
      name: QUEUE.undoLabel('Vento Norte (2020)'),
    })
    expect(posted(undo.closest('form') as HTMLElement)).toEqual({
      kind: 'reopen',
      id: 'vento-norte-2020-e2bf439e1af6',
    })
  })

  it('asks TMDB again for the whole queue', () => {
    render(<QueueScreen queue={QUEUE_PAGE} />)
    expect(posted(screen.getByRole('form', { name: QUEUE.reprocess }))).toEqual(
      { kind: 'reprocess' },
    )
  })

  it('says when nothing waits, and when the engine cannot run', () => {
    render(<QueueScreen queue={{ items: [], names: {}, attributions: [] }} />)
    expect(screen.getByText(QUEUE.empty)).toBeTruthy()
    cleanup()
    render(<QueueScreen queue={null} />)
    expect(screen.getByRole('alert').textContent).toContain(QUEUE.unavailable)
    expect(screen.queryByRole('form')).toBeNull()
  })

  it.each(QUEUE_NOTICES)('says what happened: %s', (notice) => {
    render(
      <QueueScreen
        queue={QUEUE_PAGE}
        done={{ notice, resolved: 2, left: 1 }}
      />,
    )
    expect(screen.getByRole('status').textContent).toContain(
      QUEUE.notices[notice](undefined, 2, 1),
    )
  })
})

describe('QueueScreen, reprocessing and refusals', () => {
  it('counts what reprocessing did', () => {
    expect(QUEUE.notices.reprocessado(undefined, 1, 0)).toBe(
      'Procurei de novo: 1 filme saiu da fila, 0 continuam.',
    )
    expect(QUEUE.notices.reprocessado()).toBe(
      'Procurei de novo: 0 filmes saíram da fila, 0 continuam.',
    )
  })

  it.each(QUEUE_REFUSALS)('says why not: %s', (refusal) => {
    render(<QueueScreen queue={QUEUE_PAGE} refusal={refusal} />)
    expect(screen.getByRole('alert').textContent).toContain(
      QUEUE.refusals[refusal],
    )
  })
})
