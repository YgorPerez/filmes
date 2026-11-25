// @vitest-environment jsdom
// The Feedback form as the Dono fills it, one test per kind of reaction:
// what it posts is what the server reads (`parseFeedback`, the same reader
// the route uses).
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { FEEDBACK_REFUSALS, parseFeedback } from '#/content/feedback-form'
import type { FeedbackPage, FeedbackSession } from '#/platform/feedback'
import { FEEDBACK } from './feedback.copy'
import { FeedbackScreen, OpenSessions } from './feedback'

afterEach(cleanup)

const SESSION: FeedbackSession = {
  id: '2026-11-20-iara-quim',
  date: '2026-11-20',
  request: 'algo leve',
  attendees: [
    { person: 'bruno', name: 'Bruno', owner: true },
    { person: 'iara', name: 'Iara', owner: false },
    { person: 'quim', name: 'Quim', owner: false },
  ],
  recommendation: [
    { position: 1, id: 'tt9000101', title: 'O Farol de Areia' },
    { position: 2, id: 'tt9000601', title: 'Pequenos Milagres' },
  ],
}

const PAGE: FeedbackPage = {
  ...SESSION,
  credit: [
    { person: 'bruno', name: 'Bruno', value: 0, line: null },
    {
      person: 'iara',
      name: 'Iara',
      value: 0.4444,
      line: 'na Sessão de 2026-11-19 (Casa Cheia), Iara deu 1 e a média dos Presentes foi 3',
    },
    { person: 'quim', name: 'Quim', value: 0, line: null },
  ],
}

function show(page: FeedbackPage = PAGE) {
  render(<FeedbackScreen session={page.id} page={page} />)
  return {
    user: userEvent.setup(),
    form: screen.getByRole('form', { name: FEEDBACK.form.label }),
  }
}

/** The form's Feedback as the server reads it. */
const posted = (form: HTMLElement) => {
  const element = form as HTMLFormElement
  expect(element.method).toBe('post')
  expect(new URL(element.action).pathname).toBe(
    '/feedback/2026-11-20-iara-quim/enviar',
  )
  return parseFeedback(new FormData(element))
}

const reaction = (name: string) => screen.getByLabelText(`Reação: ${name}`)
const comment = (name: string) =>
  screen.getByLabelText(`Comentário: ${name}`, { exact: false })

describe('FeedbackScreen', () => {
  it('records the Dono’s Nota for a film of the list', async () => {
    const { user, form } = show()
    await user.click(screen.getByLabelText(/O Farol de Areia/))
    await user.selectOptions(reaction('Bruno'), 'Nota 4,5')
    expect(posted(form)).toEqual({
      ok: {
        film: 'tt9000101',
        reactions: [
          {
            person: 'bruno',
            kind: 'rating',
            rating: '4,5',
            comment: undefined,
          },
        ],
      },
    })
  })

  it('records the Nota another Presente gave, with her comment', async () => {
    const { user, form } = show()
    await user.click(screen.getByLabelText(/Pequenos Milagres/))
    await user.selectOptions(reaction('Iara'), 'Nota 2')
    await user.type(comment('Iara'), ' lento demais ')
    expect(posted(form)).toEqual({
      ok: {
        film: 'tt9000601',
        reactions: [
          {
            person: 'iara',
            kind: 'rating',
            rating: '2',
            comment: 'lento demais',
          },
        ],
      },
    })
  })

  it('records a Relato of the Dono about another Presente', async () => {
    const { user, form } = show()
    await user.click(screen.getByLabelText(/Pequenos Milagres/))
    await user.selectOptions(reaction('Quim'), 'não gostou')
    await user.selectOptions(reaction('Iara'), 'gostou')
    expect(posted(form)).toEqual({
      ok: {
        film: 'tt9000601',
        reactions: [
          { person: 'iara', kind: 'report', level: 'gostou' },
          { person: 'quim', kind: 'report', level: 'não gostou' },
        ].map((r) => ({ ...r, comment: undefined })),
      },
    })
  })

  it('offers no Relato for the Dono: she speaks with her Nota', () => {
    show()
    const options = within(reaction('Bruno')).getAllByRole('option')
    expect(options.map((o) => o.textContent)).not.toContain('gostou')
    expect(
      within(reaction('Iara'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toContain('gostou')
  })

  it('records a film out of the list by its title', async () => {
    const { user, form } = show()
    await user.click(screen.getByLabelText(FEEDBACK.form.other))
    await user.type(
      screen.getByLabelText(FEEDBACK.form.search, { exact: false }),
      'Casa Cheia (2001)',
    )
    expect(posted(form)).toEqual({
      ok: { film: 'Casa Cheia (2001)', reactions: [] },
    })
  })

  it('takes the search as the film even with no radio chosen', async () => {
    const { user, form } = show()
    await user.type(
      screen.getByLabelText(FEEDBACK.form.search, { exact: false }),
      'tt9000602',
    )
    expect(posted(form)).toEqual({ ok: { film: 'tt9000602', reactions: [] } })
  })

  it('records "não vimos nada", with no reaction', async () => {
    const { user, form } = show()
    await user.click(screen.getByLabelText(/Não vimos nada/))
    expect(posted(form)).toEqual({ ok: { film: null, reactions: [] } })
  })

  it('refuses "não vimos nada" with a reaction', async () => {
    const { user, form } = show()
    await user.click(screen.getByLabelText(/Não vimos nada/))
    await user.selectOptions(reaction('Bruno'), 'Nota 3')
    expect(posted(form)).toEqual({ refused: 'nada' })
  })

  it('refuses a comment with no Nota or Relato', async () => {
    const { user, form } = show()
    await user.click(screen.getByLabelText(/O Farol de Areia/))
    await user.type(comment('Quim'), 'dormiu')
    expect(posted(form)).toEqual({ refused: 'comentario' })
  })

  it('refuses a form with no film', () => {
    const { form } = show()
    expect(posted(form)).toEqual({ refused: 'filme' })
  })

  it('shows who has Crédito now, with the Session it came from', () => {
    show()
    const credit = screen.getByRole('region', { name: FEEDBACK.credit.title })
    expect(credit.textContent).toMatch(/Iara/)
    expect(credit.textContent).toMatch(/Casa Cheia/)
    expect(credit.textContent).toContain('Crédito 0,44')
    expect(credit.textContent).not.toMatch(/Quim/)
  })

  it('says nobody has Crédito, and has no Crédito alone', () => {
    show({ ...PAGE, credit: PAGE.credit.map((c) => ({ ...c, line: null })) })
    expect(
      screen.getByRole('region', { name: FEEDBACK.credit.title }).textContent,
    ).toContain(FEEDBACK.credit.empty)
    cleanup()
    show({
      ...PAGE,
      attendees: PAGE.attendees.slice(0, 1),
      credit: PAGE.credit.slice(0, 1),
    })
    expect(screen.queryByRole('region', { name: FEEDBACK.credit.title })).toBe(
      null,
    )
  })

  it('says every refusal, and when the Session is not open', () => {
    for (const refusal of FEEDBACK_REFUSALS) {
      render(<FeedbackScreen session={PAGE.id} page={PAGE} refusal={refusal} />)
      expect(screen.getByRole('alert').textContent).toContain(
        FEEDBACK.refusals[refusal],
      )
      cleanup()
    }
    render(<FeedbackScreen session="x" page="unknown" />)
    expect(screen.getByRole('alert').textContent).toContain(
      FEEDBACK.form.unknown,
    )
    cleanup()
    render(<FeedbackScreen session="x" page={null} />)
    expect(screen.getByRole('alert').textContent).toContain(
      FEEDBACK.unavailable,
    )
  })
})

describe('OpenSessions', () => {
  it('lists each open Session as a link to its form', () => {
    render(<OpenSessions sessions={[SESSION]} />)
    const link = screen.getByRole('link', { name: /Bruno, Iara, Quim/ })
    expect(link.getAttribute('href')).toBe('/feedback/2026-11-20-iara-quim')
    expect(link.textContent).toContain('algo leve · 2 filmes')
  })

  it('says what was recorded, and when there is nothing to list', () => {
    render(<OpenSessions sessions={[]} recorded="2026-11-20-iara" gone />)
    expect(screen.getByRole('status').textContent).toContain(
      FEEDBACK.list.recorded('2026-11-20-iara'),
    )
    expect(screen.getByRole('alert').textContent).toContain(FEEDBACK.list.gone)
    expect(screen.getByText(FEEDBACK.list.empty)).toBeTruthy()
    cleanup()
    render(<OpenSessions sessions={null} />)
    expect(screen.getByRole('alert').textContent).toContain(
      FEEDBACK.unavailable,
    )
  })
})

describe('parseFeedback', () => {
  const form = (fields: Record<string, string>) => {
    const data = new FormData()
    for (const [name, value] of Object.entries(fields)) data.set(name, value)
    return parseFeedback(data)
  }

  it.each<Record<string, string>>([
    { filme: 'tt1', 'reacao.iara': 'nota:7' },
    { filme: 'tt1', 'reacao.iara': 'relato:amou' },
    { filme: 'tt1', 'reacao.iara': 'estrelas' },
    { filme: '../x' },
  ])('refuses what the form does not offer: %j', (fields) => {
    expect(form(fields)).toEqual({ refused: 'pedido' })
  })
})

describe('the Catálogo search', () => {
  it('comes back from the Catálogo search with its film chosen', () => {
    const search = {
      query: 'cheia',
      found: {
        query: 'cheia',
        films: [
          {
            id: 'tt9000602',
            title: 'Casa Cheia',
            year: 2021,
            votes: 50000,
            rating: null,
            directors: [],
          },
        ],
        people: [],
        genres: [],
        series: [],
      },
    }
    render(<FeedbackScreen session={PAGE.id} page={PAGE} search={search} />)
    const use = screen.getByRole('link', { name: 'Usar Casa Cheia (2021)' })
    expect(use.getAttribute('href')).toBe(
      '/feedback/2026-11-20-iara-quim?filme=tt9000602&buscar=cheia',
    )
    const form = () => screen.getByRole('form', { name: FEEDBACK.form.label })

    // The form's defaults are set when the page loads, as after the link.
    cleanup()
    render(<FeedbackScreen session={PAGE.id} page={PAGE} film="tt9000602" />)
    expect(posted(form())).toEqual({ ok: { film: 'tt9000602', reactions: [] } })
    expect(
      (screen.getByLabelText(FEEDBACK.form.other) as HTMLInputElement).checked,
    ).toBe(true)

    cleanup()
    render(<FeedbackScreen session={PAGE.id} page={PAGE} film="tt9000601" />)
    expect(posted(form())).toEqual({ ok: { film: 'tt9000601', reactions: [] } })
    expect(
      (
        screen.getByLabelText(FEEDBACK.form.search, {
          exact: false,
        }) as HTMLInputElement
      ).value,
    ).toBe('')
  })
})
