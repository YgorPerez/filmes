// @vitest-environment jsdom
// The Sessions list and a Session's page: what each shows, and where its
// links go.
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import type { CartazPage } from '#/platform/billboard'
import type { SessionItem } from '#/platform/sessions'
import { MODEL } from './billboard.fixture'
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
    // The stub: date, Presentes and how many films, a link to its page.
    expect(
      within(row)
        .getByRole('link', { name: '2026-11-20 · Bruno, Iara · 2 filmes' })
        .getAttribute('href'),
    ).toBe('/sessoes/2026-11-20-iara')
    // The request on the shelf label, the Dono's words on the paper.
    expect(
      within(row).getByRole('img', {
        name: 'leve · até 2h · com criança de 7 anos',
      }),
    ).toBeTruthy()
    expect(within(row).getByText('eu e a Iara')).toBeTruthy()
    expect(
      within(row)
        .getByRole('link', { name: SESSIONS.list.feedbackLabel(OPEN.id) })
        .getAttribute('href'),
    ).toBe('/feedback/2026-11-20-iara')

    const closed = region(SESSIONS.list.closed)
    const [chosen, nothing] = within(closed).getAllByRole('listitem')
    expect(chosen!.textContent).toContain(
      '2026-11-19 · viram Pequenos Milagres',
    )
    expect(within(chosen!).getByRole('link').getAttribute('href')).toBe(
      '/sessoes/2026-11-19-quim',
    )
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
  const PAGE: CartazPage = {
    session: OPEN,
    billboard: MODEL,
    warnings: [],
    addition: null,
  }

  it('shows the Cartaz of a Session just opened, posting to its reply, and the way to its Feedback', () => {
    render(<SessionScreen page={PAGE} notice="aberta" />)
    expect(screen.getByRole('status').textContent).toBe(
      SESSIONS.session.notices.aberta,
    )
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Sessão 2026-11-20',
    )
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(
      screen.getByRole('form', { name: 'Cartaz' }).getAttribute('action'),
    ).toBe('/sessoes/2026-11-20-iara/responder')
    expect(
      screen
        .getByRole('link', { name: SESSIONS.list.feedback })
        .getAttribute('href'),
    ).toBe('/feedback/2026-11-20-iara')
  })

  it('shows what the reply or the form left: the warnings, the acrescentar, a refusal', () => {
    render(
      <SessionScreen
        page={{
          ...PAGE,
          warnings: ['só 2 passaram nas Restrições'],
          addition: 'chegou a Ana',
        }}
        notice="regerada"
        refusal="regerar"
      />,
    )
    const [regenerated, warnings, addition] = screen.getAllByRole('status')
    expect(regenerated!.textContent).toBe(SESSIONS.session.notices.regerada)
    expect(warnings!.textContent).toBe(
      `${SESSIONS.session.warnings}só 2 passaram nas Restrições`,
    )
    expect(addition!.textContent).toContain('“chegou a Ana”')
    expect(within(addition!).getByRole('link').getAttribute('href')).toBe(
      '/pessoas',
    )
    expect(screen.getByRole('alert').textContent).toContain(
      SESSIONS.session.refusals.regerar,
    )
  })

  it('says a closed Session is closed, and what they saw', () => {
    render(
      <SessionScreen
        page={{
          ...PAGE,
          session: CLOSED,
          billboard: { ...MODEL, open: false },
        }}
      />,
    )
    expect(screen.getByRole('status').textContent).toBe(
      'Fechada · viram Pequenos Milagres',
    )
    expect(
      screen.queryByRole('link', { name: SESSIONS.list.feedback }),
    ).toBeNull()
  })

  it('says when the Cartaz could not be made, when there is no such Session, or the engine cannot run', () => {
    render(<SessionScreen page={{ ...PAGE, billboard: null }} />)
    expect(screen.getByRole('alert').textContent).toContain(
      SESSIONS.unavailable,
    )
    cleanup()
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
