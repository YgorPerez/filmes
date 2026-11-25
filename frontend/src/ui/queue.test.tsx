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
import { QUEUE } from './imports.copy'
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
        },
        {
          tmdb: '9103',
          title: 'Vento Norte',
          originalTitle: 'Nordwind',
          year: 2020,
          link: 'https://www.themoviedb.org/movie/9103',
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

/** The form's action as the server reads it. */
const posted = (form: HTMLElement) => {
  expect(form).toBeInstanceOf(HTMLFormElement)
  const element = form as HTMLFormElement
  expect(element.method).toBe('post')
  expect(new URL(element.action).pathname).toBe('/fila/acao')
  return parseQueue(new FormData(element))
}

describe('QueueScreen', () => {
  it('shows each film, why it waits and whose it is', () => {
    render(<QueueScreen queue={QUEUE_PAGE} />)
    const lost = card('Filme Perdido (2001)')
    expect(lost.textContent).toContain(
      'nem o Wikidata nem o TMDB acharam o filme',
    )
    // A Pessoa the list does not name shows by her slug.
    expect(lost.textContent).toContain('de Quim, olga')
    expect(within(lost).queryByText(QUEUE.candidates)).toBeNull()
    const wind = card('Vento Norte (2020)')
    expect(within(wind).getByText(QUEUE.candidates)).toBeTruthy()
    expect(within(wind).getByText('Nordwind')).toBeTruthy()
    expect(
      within(wind)
        .getAllByRole('link', { name: 'Vento Norte (2020)' })
        .map((a) => a.getAttribute('href')),
    ).toEqual([
      'https://www.themoviedb.org/movie/9102',
      'https://www.themoviedb.org/movie/9103',
    ])
    expect(screen.getByText(/uses the TMDB API/)).toBeTruthy()
  })

  it('confirms a film with one of TMDB’s suggestions', () => {
    render(<QueueScreen queue={QUEUE_PAGE} />)
    const button = within(card('Vento Norte (2020)')).getByRole('button', {
      name: QUEUE.pickLabel('Vento Norte (2020)', '9103'),
    })
    expect(posted(button.closest('form') as HTMLElement)).toEqual({
      kind: 'confirm',
      id: 'vento-norte-2020-e2bf439e1af6',
      film: 'https://www.themoviedb.org/movie/9103',
    })
  })

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

  it('discards a film with a reason, or with “ignorar” when none', async () => {
    render(<QueueScreen queue={QUEUE_PAGE} />)
    const user = userEvent.setup()
    const lost = card('Filme Perdido (2001)')
    await user.click(within(lost).getByText(QUEUE.discardOpen))
    const form = within(lost).getByRole('form', {
      name: 'Descartar Filme Perdido (2001)',
    })
    expect(posted(form)).toEqual({
      kind: 'discard',
      id: 'filme-perdido-2001-91d7fc73cdee',
      reason: 'ignorar',
    })
    await user.type(
      within(form).getByLabelText(QUEUE.reason, { exact: false }),
      'não é filme',
    )
    expect(posted(form)).toEqual({
      kind: 'discard',
      id: 'filme-perdido-2001-91d7fc73cdee',
      reason: 'não é filme',
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
      QUEUE.notices[notice](2, 1),
    )
  })

  it('counts what reprocessing did', () => {
    expect(QUEUE.notices.reprocessado(1, 0)).toBe(
      'TMDB consultado de novo: 1 filme saiu da fila, 0 continuam.',
    )
    expect(QUEUE.notices.reprocessado()).toBe(
      'TMDB consultado de novo: 0 filmes saíram da fila, 0 continuam.',
    )
  })

  it.each(QUEUE_REFUSALS)('says why not: %s', (refusal) => {
    render(<QueueScreen queue={QUEUE_PAGE} refusal={refusal} />)
    expect(screen.getByRole('alert').textContent).toContain(
      QUEUE.refusals[refusal],
    )
  })
})
