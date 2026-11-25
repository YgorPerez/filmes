// @vitest-environment jsdom
// The Sessions list and a Session's page: what each shows, and where its
// links go.
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import type { SessionItem } from '#/platform/sessions'
import { SessionList, SessionScreen } from './sessions'
import { SESSIONS } from './sessions.copy'

afterEach(cleanup)

const OPEN: SessionItem = {
  id: '2026-11-20-iara',
  date: '2026-11-20',
  request: 'eu e a Iara',
  attendees: [
    { person: 'bruno', name: 'Bruno', owner: true },
    { person: 'iara', name: 'Iara', owner: false },
  ],
  recommendation: [
    { position: 1, id: 'tt9000101', title: 'O Farol de Areia' },
    { position: 2, id: 'tt9000601', title: 'Pequenos Milagres' },
  ],
  open: true,
  chosen: null,
  moods: ['leve'],
  constraints: ['até 2h', 'com criança de 7 anos'],
}

const CLOSED: SessionItem = {
  ...OPEN,
  id: '2026-11-19-quim',
  date: '2026-11-19',
  request: null,
  attendees: [{ person: 'quim', name: 'Quim', owner: false }],
  open: false,
  chosen: { id: 'tt9000601', title: 'Pequenos Milagres' },
  moods: [],
  constraints: [],
}

const region = (name: string) => screen.getByRole('region', { name })

describe('the Sessions list', () => {
  it('shows the open Sessions with their Feedback, then the closed ones', () => {
    render(
      <SessionList
        sessions={[OPEN, CLOSED, { ...CLOSED, id: 'x', chosen: null }]}
      />,
    )
    expect(
      screen
        .getByRole('link', { name: SESSIONS.list.create })
        .getAttribute('href'),
    ).toBe('/sessoes/nova')

    const open = region(SESSIONS.list.open)
    const row = within(open).getAllByRole('listitem')[0]!
    expect(row.textContent).toContain('2026-11-20 · Bruno, Iara')
    expect(row.textContent).toContain(
      'eu e a Iara · 2 filmes · até 2h · com criança de 7 anos',
    )
    expect(
      within(row)
        .getByRole('link', { name: /2026-11-20 · Bruno, Iara/ })
        .getAttribute('href'),
    ).toBe('/sessoes/2026-11-20-iara')
    expect(
      within(row)
        .getByRole('link', { name: SESSIONS.list.feedbackLabel(OPEN.id) })
        .getAttribute('href'),
    ).toBe('/feedback/2026-11-20-iara')

    const closed = region(SESSIONS.list.closed)
    const [chosen, nothing] = within(closed).getAllByRole('listitem')
    expect(chosen!.textContent).toContain('viram Pequenos Milagres')
    expect(nothing!.textContent).toContain('não viram nada')
    expect(within(closed).queryByText(SESSIONS.list.feedback)).toBeNull()
  })

  it('says when there is no Session yet', () => {
    render(<SessionList sessions={[]} />)
    expect(region(SESSIONS.list.open).textContent).toContain(
      SESSIONS.list.openEmpty,
    )
    expect(region(SESSIONS.list.closed).textContent).toContain(
      SESSIONS.list.closedEmpty,
    )
  })

  it('says when the engine cannot run here', () => {
    render(<SessionList sessions={null} />)
    expect(screen.getByRole('alert').textContent).toContain(
      SESSIONS.unavailable,
    )
  })
})

describe('a Session’s page', () => {
  it('shows the Recomendação of a Session just opened, and the way to its Feedback', () => {
    render(<SessionScreen page={OPEN} opened />)
    expect(screen.getByRole('status').textContent).toBe(SESSIONS.session.opened)
    expect(screen.getByText(/Clima: leve · até 2h/).textContent).toBe(
      'Bruno, Iara · eu e a Iara · Clima: leve · até 2h · com criança de 7 anos',
    )
    const films = within(region(SESSIONS.session.films)).getAllByRole(
      'listitem',
    )
    expect(films.map((f) => f.textContent)).toEqual([
      '1O Farol de Areia',
      '2Pequenos Milagres',
    ])
    expect(
      screen
        .getByRole('link', { name: SESSIONS.list.feedback })
        .getAttribute('href'),
    ).toBe('/feedback/2026-11-20-iara')
  })

  it('says a closed Session is closed, and what they saw', () => {
    render(<SessionScreen page={CLOSED} />)
    expect(screen.getByRole('status').textContent).toBe(
      'Fechada · viram Pequenos Milagres',
    )
    expect(
      screen.queryByRole('link', { name: SESSIONS.list.feedback }),
    ).toBeNull()
  })

  it('says when nothing passed the Restrições', () => {
    render(<SessionScreen page={{ ...OPEN, recommendation: [] }} />)
    expect(region(SESSIONS.session.films).textContent).toContain(
      SESSIONS.session.empty,
    )
  })

  it('says when there is no such Session, or the engine cannot run', () => {
    render(<SessionScreen page="unknown" />)
    expect(screen.getByRole('alert').textContent).toContain(
      SESSIONS.session.unknown,
    )
    cleanup()
    render(<SessionScreen page={null} />)
    expect(screen.getByRole('alert').textContent).toContain(
      SESSIONS.unavailable,
    )
  })
})
