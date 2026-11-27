// @vitest-environment jsdom
// The Feedback form as the Dono fills it, one test per kind of reaction:
// what it posts is what the server reads (`parseFeedback`, the same reader
// the route uses).
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import {
  FEEDBACK_REFUSALS,
  parseFeedback,
  type FeedbackRefusal,
} from '#/content/feedback-form'
import type { FeedbackPage, FeedbackSession } from '#/platform/feedback'
import { FEEDBACK } from './feedback.copy'
import { FeedbackScreen } from './feedback'

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
  moods: [],
  constraints: [],
  additions: [],
  stars: {},
  earlier: [],
  recommendation: [
    { position: 1, id: 'tt9000101', title: 'O Farol de Areia' },
    { position: 2, id: 'tt9000601', title: 'Pequenos Milagres' },
  ],
}

const PAGE: FeedbackPage = {
  ...SESSION,
  satisfaction: [
    { person: 'bruno', name: 'Bruno', satisfaction: 1, line: null },
    {
      person: 'iara',
      name: 'Iara',
      satisfaction: 0.1111,
      line: 'satisfação de Iara nas últimas Sessões: 11%, e a mais alta do grupo, 100%; na de qui, 19 nov (Casa Cheia), deu 2 de 10',
    },
    { person: 'quim', name: 'Quim', satisfaction: 1, line: null },
  ],
}

function show(page: FeedbackPage = PAGE, refusal?: FeedbackRefusal) {
  render(<FeedbackScreen session={page.id} page={page} refusal={refusal} />)
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

/** Her Nota on the 1 to 10 (#272). */
const rate = (name: string, n: string) =>
  within(
    screen.getByRole('radiogroup', { name: FEEDBACK.form.ratingLabel(name) }),
  ).getByRole('radio', { name: n })
/** Her reaction's radio by its value: a Relato's pill, or "sem reação". */
const reaction = (person: string, value: string) =>
  document.querySelector(
    `input[name="reacao.${person}"][value="${value}"]`,
  ) as HTMLInputElement | null
const comment = (name: string) =>
  screen.getByLabelText(`Comentário: ${name}`, { exact: false })

describe('FeedbackScreen', () => {
  it('records the Dono’s Nota for a film of the list', async () => {
    const { user, form } = show()
    await user.click(screen.getByLabelText(/O Farol de Areia/))
    await user.click(rate('Bruno', '9'))
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
    await user.click(rate('Iara', '4'))
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
})

describe('FeedbackScreen, what the Cartaz knows (#272)', () => {
  it('starts on the film with the most stars, and says them', () => {
    const { form } = show({
      ...PAGE,
      stars: { tt9000101: 2, tt9000601: 4 },
    })
    expect((screen.getByLabelText(/Pequenos Milagres/) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByText(FEEDBACK.form.stars(4))).toBeTruthy()
    expect(posted(form)).toEqual({ ok: { film: 'tt9000601', reactions: [] } })
  })

  it('starts on the only film left, and offers the ones that left the shelf', async () => {
    const { user, form } = show({
      ...PAGE,
      recommendation: [PAGE.recommendation[0]!],
      earlier: [{ id: 'tt9001106', title: 'Sessão Maldita' }],
    })
    expect((screen.getByLabelText(/O Farol de Areia/) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByText(FEEDBACK.form.earlier)).toBeTruthy()
    await user.click(screen.getByLabelText(/Sessão Maldita/))
    expect(posted(form)).toEqual({ ok: { film: 'tt9001106', reactions: [] } })
  })

  it('chooses nothing by itself when the Cartaz points to no film', () => {
    show()
    expect((screen.getByLabelText(/O Farol de Areia/) as HTMLInputElement).checked).toBe(false)
    expect((screen.getByLabelText(/Pequenos Milagres/) as HTMLInputElement).checked).toBe(false)
  })

  it('gives every Presente the 1 to 10 in the open', () => {
    show()
    for (const name of ['Bruno', 'Iara', 'Quim'])
      expect(
        screen.getByRole('radiogroup', {
          name: FEEDBACK.form.ratingLabel(name),
        }),
      ).toBeTruthy()
  })
})

describe('FeedbackScreen, Relatos and the choice', () => {
  it('records a Relato of the Dono about another Presente', async () => {
    const { user, form } = show()
    await user.click(screen.getByLabelText(/Pequenos Milagres/))
    await user.click(reaction('quim', 'relato:nao-gostou')!)
    await user.click(reaction('iara', 'relato:gostou')!)
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
    expect(reaction('bruno', 'relato:gostou')).toBeNull()
    expect(reaction('bruno', '')).toBeTruthy()
    expect(reaction('iara', 'relato:gostou')).toBeTruthy()
  })

  it('asks for reactions only once a film is chosen, and drops a film refusal then', async () => {
    const { user } = show(PAGE, 'filme')
    const reactions = screen
      .getByRole('heading', { name: FEEDBACK.form.reactions(false) })
      .closest('fieldset')!
    expect(reactions.className).toContain('hidden')
    expect(screen.getByRole('alert')).toBeTruthy()
    await user.click(screen.getByLabelText(/O Farol de Areia/))
    expect(screen.queryByRole('alert')).toBeNull()
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

  it('records "não vimos nada", with no reaction', async () => {
    const { user, form } = show()
    await user.click(screen.getByLabelText(/Não vimos nada/))
    expect(posted(form)).toEqual({ ok: { film: null, reactions: [] } })
  })
})

describe('FeedbackScreen, checks and satisfaction', () => {
  it('omits reactions when the choice changes to "não vimos nada"', async () => {
    const { user, form } = show()
    await user.click(screen.getByLabelText(/O Farol de Areia/))
    await user.click(rate('Bruno', '6'))
    await user.click(screen.getByLabelText(/Não vimos nada/))
    expect(posted(form)).toEqual({ ok: { film: null, reactions: [] } })
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

  it('shows who is behind in satisfaction now, with the Session it cites', () => {
    show()
    const region = screen.getByRole('region', {
      name: FEEDBACK.satisfaction.title,
    })
    expect(region.textContent).toMatch(/Iara/)
    expect(region.textContent).toMatch(/Casa Cheia/)
    expect(region.textContent).toContain('11%')
    expect(region.textContent).not.toMatch(/Quim/)
  })

  it('says nobody is behind, and has no satisfaction alone', () => {
    show({
      ...PAGE,
      satisfaction: PAGE.satisfaction.map((c) => ({ ...c, line: null })),
    })
    expect(
      screen.getByRole('region', { name: FEEDBACK.satisfaction.title })
        .textContent,
    ).toContain(FEEDBACK.satisfaction.empty)
    cleanup()
    show({
      ...PAGE,
      attendees: PAGE.attendees.slice(0, 1),
      satisfaction: PAGE.satisfaction.slice(0, 1),
    })
    expect(
      screen.queryByRole('region', { name: FEEDBACK.satisfaction.title }),
    ).toBe(null)
  })
})

describe('FeedbackScreen, refusals', () => {
  it('says every refusal, and when the Session is not open', () => {
    for (const refusal of FEEDBACK_REFUSALS) {
      render(<FeedbackScreen session={PAGE.id} page={PAGE} refusal={refusal} />)
      expect(screen.getByRole('alert').textContent).toContain(
        FEEDBACK.refusals[refusal],
      )
      cleanup()
    }
    render(<FeedbackScreen session="x" page="unknown" />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      FEEDBACK.form.unknown,
    )
    cleanup()
    // Told already: what they saw, and the way to it (#272).
    render(
      <FeedbackScreen
        session="x"
        page="unknown"
        told={{ title: 'Pequenos Milagres' }}
      />,
    )
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      FEEDBACK.form.told('Pequenos Milagres'),
    )
    expect(
      screen
        .getByRole('link', { name: FEEDBACK.form.toSession })
        .getAttribute('href'),
    ).toBe('/sessoes/x')
    cleanup()
    render(<FeedbackScreen session="x" page={null} />)
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
    { filme: 'tt1', 'reacao.iara': 'nota:4,5' },
    { filme: 'tt1', 'reacao.iara': 'nota:11' },
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
    const form = () => screen.getByRole('form', { name: FEEDBACK.form.label })

    // The form's defaults are set when the page loads, as after the link
    // (before the JavaScript: `feedback-plain.test.tsx`).
    render(
      <FeedbackScreen
        session={PAGE.id}
        page={PAGE}
        search={search}
        film="tt9000602"
      />,
    )
    expect(posted(form())).toEqual({ ok: { film: 'tt9000602', reactions: [] } })
    expect(screen.getByText('Casa Cheia', { selector: 'p' })).toBeTruthy()
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
