// @vitest-environment jsdom
// The group swipe's deck (#182): one film at a time, Não or Sim, and the
// form that posts every Voto at once.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { FETCH_HEADER } from '#/content/fetch-answer'
import { votePath, voteSearch } from '#/content/session-votes-address'
import { PARTICIPATION } from './session-link.copy'
import { VOTES } from './session-votes.copy'
import { VoteCards, VoteScreen } from './session-votes'
import { FILMS } from './session-link.fixture'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const DECK = { version: 2, films: FILMS, left: [] }

const posted = () => {
  const form = document.querySelector('form')
  if (!form) throw new Error('Expected the deck’s form')
  return [...new FormData(form)]
}

it('shows one film at a time and posts every Voto with the version', async () => {
  const user = userEvent.setup()
  render(<VoteCards deck={DECK} action="/participar/votos?sessao=s" />)

  expect(screen.getByRole('heading', { name: 'O Farol de Areia' })).toBeTruthy()
  expect(screen.getByText(VOTES.of(1, 3))).toBeTruthy()
  expect(screen.queryByRole('button', { name: VOTES.send })).toBeNull()

  await user.click(screen.getByRole('button', { name: VOTES.yes }))
  await user.click(screen.getByRole('button', { name: VOTES.no }))
  expect(screen.getByRole('heading', { name: 'Noite de Estreia' })).toBeTruthy()
  await user.click(screen.getByRole('button', { name: VOTES.back }))
  expect(
    screen.getByRole('heading', { name: 'Pequenos Milagres' }),
  ).toBeTruthy()
  await user.click(screen.getByRole('button', { name: VOTES.no }))
  await user.click(screen.getByRole('button', { name: VOTES.yes }))

  expect(
    screen.getByRole('heading', { name: VOTES.summary(2, 1) }),
  ).toBeTruthy()
  expect(screen.getByText(VOTES.leaving(['Pequenos Milagres']))).toBeTruthy()
  expect(screen.getByRole('button', { name: VOTES.send })).toBeTruthy()
  expect(document.querySelector('form')?.getAttribute('action')).toBe(
    '/participar/votos?sessao=s',
  )
  expect(posted()).toEqual([
    ['versao', '2'],
    ['sim', 'tt9000101'],
    ['nao', 'tt9000601'],
    ['sim', 'tt9000701'],
  ])

  await user.click(screen.getByRole('button', { name: VOTES.restart }))
  expect(screen.getByRole('heading', { name: 'O Farol de Areia' })).toBeTruthy()
  expect(posted()).toEqual([['versao', '2']])
})

it('a drag to the left is a no and to the right a yes; a short one is nothing', () => {
  render(<VoteCards deck={DECK} action="/participar/votos" />)
  const drag = (from: number, to: number) => {
    const card = screen.getByRole('article')
    fireEvent.pointerDown(card, { clientX: from })
    fireEvent.pointerUp(card, { clientX: to })
  }

  drag(200, 180)
  expect(screen.getByRole('heading', { name: 'O Farol de Areia' })).toBeTruthy()
  // A cancelled drag, or a release with no press, votes nothing.
  const card = screen.getByRole('article')
  fireEvent.pointerDown(card, { clientX: 200 })
  fireEvent.pointerCancel(card)
  fireEvent.pointerUp(card, { clientX: 40 })
  fireEvent.pointerUp(card, { clientX: 400 })
  expect(screen.getByRole('heading', { name: 'O Farol de Areia' })).toBeTruthy()
  drag(200, 40)
  drag(40, 200)

  expect(posted()).toEqual([
    ['versao', '2'],
    ['nao', 'tt9000101'],
    ['sim', 'tt9000601'],
  ])
})

const LINK = { sessao: '2026-11-20-iara', chave: 'k', presente: 'iara' }
const HOME = '/participar?sessao=2026-11-20-iara&chave=k&presente=iara'

it('keeps the votes on screen when the server could not record them', async () => {
  const answer = Promise.withResolvers<Response>()
  const fetchVotes = vi.fn<typeof fetch>(() => answer.promise)
  vi.stubGlobal('fetch', fetchVotes)
  render(<VoteScreen deck={DECK} search={LINK} home={HOME} />)
  const user = userEvent.setup()
  for (const name of [VOTES.yes, VOTES.no, VOTES.yes]) {
    await user.click(screen.getByRole('button', { name }))
  }
  const fields = posted()
  await user.click(screen.getByRole('button', { name: VOTES.send }))

  const sending = screen.getByRole<HTMLButtonElement>('button', {
    name: 'Enviando votos…',
  })
  expect(sending.disabled).toBe(true)
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: VOTES.restart })
      .disabled,
  ).toBe(true)
  sending.form?.requestSubmit()
  expect(fetchVotes).toHaveBeenCalledOnce()
  const [url, init] = fetchVotes.mock.calls[0] ?? []
  expect(url).toBe(
    new URL(votePath('votos', LINK), window.location.origin).href,
  )
  expect(new Headers(init?.headers).get(FETCH_HEADER)).toBe('1')
  const body = init?.body
  if (!(body instanceof FormData)) throw new Error('Expected a vote form')
  expect([...body]).toEqual(fields)

  answer.resolve(
    Response.json({ to: votePath('votar', LINK, { erro: 'indisponivel' }) }),
  )

  expect((await screen.findByRole('alert')).textContent).toBe(
    VOTES.refusals.indisponivel(),
  )
  expect(screen.getByText(VOTES.summary(2, 1))).toBeTruthy()
  expect(posted()).toEqual(fields)
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: VOTES.send })
      .disabled,
  ).toBe(false)
})

it('the deck posts the link’s search', () => {
  render(<VoteScreen deck={DECK} search={LINK} home={HOME} />)

  expect(screen.queryByRole('alert')).toBeNull()
  expect(document.querySelector('form')?.getAttribute('action')).toBe(
    '/participar/votos?sessao=2026-11-20-iara&chave=k&presente=iara',
  )
})

it('with every film voted on, it shows the night’s list with her Votos', () => {
  const films = [
    { ...FILMS[0]!, mine: 'yes' as const },
    { ...FILMS[1]!, mine: 'yes' as const },
  ]
  render(
    <VoteScreen
      deck={{ version: 3, films, left: ['Sal e Ferrugem'] }}
      search={LINK}
      home={HOME}
      questions="/participar/perguntas?x"
    />,
  )

  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
    VOTES.voted,
  )
  expect(screen.queryByRole('form')).toBeNull()
  expect(screen.getAllByText('você: sim')).toHaveLength(2)
  expect(screen.getByText(/Sal e Ferrugem/u)).toBeTruthy()
  expect(
    screen.getByRole('link', { name: VOTES.questions }).getAttribute('href'),
  ).toBe('/participar/perguntas?x')
  expect(
    screen.getByRole('link', { name: VOTES.revote }).getAttribute('href'),
  ).toBe(
    '/participar/votar?sessao=2026-11-20-iara&chave=k&presente=iara&mudar=true',
  )
})

it('after sending, it says so and offers the films that came in', () => {
  const films = [
    { ...FILMS[0]!, mine: 'yes' as const },
    { ...FILMS[1]!, mine: null, new: true },
  ]
  render(
    <VoteScreen
      deck={{ version: 3, films, left: [] }}
      search={{ ...LINK, feito: 'regerada' }}
      home={HOME}
    />,
  )

  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(VOTES.sent)
  expect(screen.getByRole('status').textContent).toBe(VOTES.notices.regerada)
  expect(screen.queryByRole('form')).toBeNull()
  expect(
    screen
      .getByRole('link', { name: 'Votar no que chegou' })
      .getAttribute('href'),
  ).toBe('/participar/votar?sessao=2026-11-20-iara&chave=k&presente=iara')
  expect(screen.queryByText(/antes do seu sim/u)).toBeNull()
})

it('after sending from an older deck, names the films her sim missed', () => {
  const films = [{ ...FILMS[0]!, mine: 'yes' as const }]
  const deck = { version: 3, films, left: [], stale: ['Quermesse'] }
  const { rerender } = render(
    <VoteScreen
      deck={deck}
      search={{ ...LINK, feito: 'regerada' }}
      home={HOME}
    />,
  )
  expect(screen.getByText(VOTES.stale(['Quermesse']))).toBeTruthy()
  // Coming back later, without the send, the list does not say it.
  rerender(<VoteScreen deck={deck} search={LINK} home={HOME} />)
  expect(screen.queryByText(VOTES.stale(['Quermesse']))).toBeNull()
})

it('a failure she cannot fix names the Dono and leaves only the list', () => {
  render(
    <VoteScreen
      deck={DECK}
      search={{ ...LINK, erro: 'falha' }}
      home={HOME}
      owner="Bruno"
    />,
  )

  expect(screen.getByRole('alert').textContent).toBe(
    VOTES.refusals.falha('Bruno'),
  )
  // The title says what the alert says, not "Você já votou".
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
    VOTES.stuck.falha,
  )
  expect(screen.queryByRole('form')).toBeNull()
  expect(
    screen.getAllByRole('link').map((a) => a.getAttribute('href')),
  ).toEqual([HOME])
})

it('her standing Votos go again with the new ones; mudar asks every film', async () => {
  const user = userEvent.setup()
  const voted = {
    version: 3,
    films: [{ ...FILMS[0]!, mine: 'yes' as const }, FILMS[1]!],
    left: [],
  }
  const { unmount } = render(
    <VoteCards deck={voted} action="/participar/votos" />,
  )
  expect(screen.getByText(VOTES.of(1, 1))).toBeTruthy()
  await user.click(screen.getByRole('button', { name: VOTES.no }))
  expect(posted()).toEqual([
    ['versao', '3'],
    ['sim', 'tt9000101'],
    ['nao', 'tt9000601'],
  ])
  unmount()

  // Mudar: her Votos come back chosen, and only the film without one is
  // asked (#340).
  render(<VoteCards deck={voted} revote action="/participar/votos" />)
  expect(screen.getByText(VOTES.of(2, 2))).toBeTruthy()
  expect(posted()).toEqual([
    ['versao', '3'],
    ['sim', 'tt9000101'],
  ])
})

it('mudar opens on the recap with her Votos chosen; Recomeçar asks every film again (#340)', async () => {
  const user = userEvent.setup()
  const voted = {
    version: 3,
    films: [
      { ...FILMS[0]!, mine: 'yes' as const },
      { ...FILMS[1]!, mine: 'no' as const },
    ],
    left: [],
  }
  render(<VoteCards deck={voted} revote action="/participar/votos" />)
  expect(screen.getByText(VOTES.kept)).toBeTruthy()
  expect(posted()).toEqual([
    ['versao', '3'],
    ['sim', 'tt9000101'],
    ['nao', 'tt9000601'],
  ])
  await user.click(screen.getByRole('button', { name: VOTES.restart }))
  expect(screen.getByText(VOTES.of(1, 2))).toBeTruthy()
  expect(posted()).toEqual([['versao', '3']])
})

it('the arrow keys vote, the next title takes the focus and is announced; the recap changes a Voto', async () => {
  const user = userEvent.setup()
  render(<VoteCards deck={DECK} action="/participar/votos" />)

  await user.keyboard('{ArrowRight}')
  const title = screen.getByRole('heading', { name: 'Pequenos Milagres' })
  expect(document.activeElement).toBe(title)
  expect(screen.getByRole('status').textContent).toBe(
    VOTES.now(2, 3, 'Pequenos Milagres'),
  )
  await user.keyboard('{ArrowLeft}')
  await user.click(screen.getByRole('button', { name: VOTES.back }))
  expect(screen.getByRole('status').textContent).toBe(
    VOTES.wentBack('Pequenos Milagres'),
  )
  await user.keyboard('{ArrowLeft}{ArrowRight}')
  // After the last card: the count is said and the recap's title has the
  // focus.
  expect(screen.getByRole('status').textContent).toBe(VOTES.end(2, 1))
  expect(document.activeElement).toBe(
    screen.getByRole('heading', { name: VOTES.summary(2, 1) }),
  )

  const row = within(
    screen.getByRole('group', { name: VOTES.voteOn('Pequenos Milagres') }),
  )
  expect(
    row.getByRole('button', { name: VOTES.no }).getAttribute('aria-pressed'),
  ).toBe('true')
  // The side already chosen changes nothing.
  await user.click(row.getByRole('button', { name: VOTES.no }))
  expect(screen.getByText(VOTES.summary(2, 1))).toBeTruthy()
  await user.click(row.getByRole('button', { name: VOTES.yes }))
  expect(
    row.getByRole('button', { name: VOTES.yes }).getAttribute('aria-pressed'),
  ).toBe('true')
  expect(posted()).toEqual([
    ['versao', '2'],
    ['sim', 'tt9000101'],
    ['sim', 'tt9000601'],
    ['sim', 'tt9000701'],
  ])
  expect(
    screen.getByRole('heading', { name: VOTES.summary(3, 0) }),
  ).toBeTruthy()
})

it('without a link there is no deck and no list', () => {
  render(<VoteScreen deck={null} search={{}} home={null} />)

  expect(screen.queryByRole('form')).toBeNull()
  expect(screen.queryByRole('link', { name: VOTES.list })).toBeNull()
})

it('the page’s search keeps only the notices and refusals it knows', () => {
  expect(
    voteSearch({ feito: 'votado', erro: 'indisponivel', mudar: 1 }),
  ).toEqual({
    feito: 'votado',
    erro: 'indisponivel',
    mudar: true,
    fora: undefined,
  })
  expect(
    voteSearch({ feito: 'x', erro: 3, mudar: 'sim', fora: ['tt1'] }),
  ).toEqual({
    feito: undefined,
    erro: undefined,
    mudar: undefined,
    fora: undefined,
  })
  expect(voteSearch({ fora: 'a b,,' })).toMatchObject({ fora: undefined })
})

it('mudar survives the router writing it back (pass 4 F1)', () => {
  // The router reads `mudar=true` as `true` and writes `true` back.
  for (const mudar of [true, 'true', 1, '1'])
    expect(voteSearch({ mudar }).mudar).toBe(true)
  const href = votePath('votar', { sessao: 's', chave: 'k' }, { mudar: true })
  const read = new URL(href, 'https://x').searchParams.get('mudar')
  expect(voteSearch({ mudar: JSON.parse(read ?? '') }).mudar).toBe(true)
})

it('fora keeps up to ten film ids', () => {
  const ids = Array.from({ length: 12 }, (_, i) => `tt${i}`)
  expect(voteSearch({ fora: [...ids, 'x y'].join(',') }).fora).toBe(
    ids.slice(0, 10).join(','),
  )
})

// The sticker on the card, not the button of the same word.
// The card's stamp, not the rule's Não / Sim marks above the card.
const STAMP = { selector: 'article span' }

const motion = (reduce: boolean) =>
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: reduce, media: query })),
  )

it('the dragged card follows the finger and shows the Voto it is near', () => {
  motion(false)
  render(<VoteCards deck={DECK} action="/participar/votos" />)
  const card = screen.getByRole('article')

  fireEvent.pointerDown(card, { clientX: 200 })
  fireEvent.pointerMove(card, { clientX: 250 })
  expect(screen.getByText(VOTES.stampYes, STAMP)).toBeTruthy()
  expect(card.style.transform).toBe('translateX(50px) rotate(3deg)')
  fireEvent.pointerMove(card, { clientX: 150 })
  expect(screen.getByText(VOTES.stampNo, STAMP)).toBeTruthy()
  fireEvent.pointerMove(card, { clientX: 210 })
  expect(screen.queryByText(VOTES.stampYes, STAMP)).toBeNull()
  expect(screen.queryByText(VOTES.stampNo, STAMP)).toBeNull()
  fireEvent.pointerUp(card, { clientX: 210 })
  expect(card.style.transform).toBe('')
})

it('with reduced motion the card stays put, and a press on a button drags nothing', () => {
  motion(true)
  render(<VoteCards deck={DECK} action="/participar/votos" />)
  const card = screen.getByRole('article')

  fireEvent.pointerDown(card, { clientX: 200 })
  fireEvent.pointerMove(card, { clientX: 300 })
  expect(card.style.transform).toBe('')
  expect(screen.queryByText(VOTES.stampYes, STAMP)).toBeNull()
  fireEvent.pointerUp(card, { clientX: 300 })
  expect(
    screen.getByRole('heading', { name: 'Pequenos Milagres' }),
  ).toBeTruthy()

  const yes = screen.getByRole('button', { name: VOTES.yes })
  fireEvent.pointerDown(yes, { clientX: 200 })
  fireEvent.pointerUp(yes, { clientX: 400 })
  expect(
    screen.getByRole('heading', { name: 'Pequenos Milagres' }),
  ).toBeTruthy()
})

it('the arrow keys in a field type there, and do not vote', async () => {
  const user = userEvent.setup()
  render(
    <>
      <input aria-label="nome" />
      <VoteCards deck={DECK} action="/participar/votos" />
    </>,
  )
  await user.click(screen.getByRole('textbox', { name: 'nome' }))
  await user.keyboard('{ArrowRight}{ArrowLeft}')
  expect(screen.getByRole('heading', { name: 'O Farol de Areia' })).toBeTruthy()
  await user.keyboard('{Escape}')
  expect(posted()).toEqual([['versao', '2']])
})

it('a standing não goes again, the original title shows, and the recap turns a sim into a não', async () => {
  const user = userEvent.setup()
  const films = [
    { ...FILMS[0]!, mine: 'no' as const },
    {
      ...FILMS[1]!,
      card: { ...FILMS[1]!.card!, originalTitle: 'Little Miracles' },
    },
  ]
  render(
    <VoteCards
      deck={{ version: 4, films, left: [] }}
      action="/participar/votos"
    />,
  )
  expect(screen.getByText('Little Miracles')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: VOTES.yes }))
  await user.click(
    within(
      screen.getByRole('group', { name: VOTES.voteOn('Pequenos Milagres') }),
    ).getByRole('button', { name: VOTES.no }),
  )
  expect(posted()).toEqual([
    ['versao', '4'],
    ['nao', 'tt9000101'],
    ['nao', 'tt9000601'],
  ])
  expect(screen.getByText(VOTES.leaving(['Pequenos Milagres']))).toBeTruthy()
})

it('every film voted and no Perguntas left: only Mudar votos', () => {
  const films = [{ ...FILMS[0]!, mine: 'yes' as const }]
  render(
    <VoteScreen
      deck={{ version: 3, films, left: [] }}
      search={LINK}
      home={HOME}
    />,
  )
  expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual([
    VOTES.revote,
  ])
})

it('films still to vote on after sending lead first, the Perguntas after', () => {
  const films = [
    { ...FILMS[0]!, mine: 'yes' as const },
    { ...FILMS[1]!, mine: null, new: true },
  ]
  render(
    <VoteScreen
      deck={{ version: 3, films, left: [] }}
      search={{ ...LINK, feito: 'votado' }}
      home={HOME}
      questions="/participar/perguntas?x"
    />,
  )
  expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual([
    'Votar no que chegou',
    VOTES.revote,
    VOTES.questions,
  ])
  expect(screen.getAllByText(PARTICIPATION.arrived)).toHaveLength(1)
})

it('the page title asks Sim ou não over the cards and says Revise on the recap', async () => {
  const user = userEvent.setup()
  render(<VoteScreen deck={DECK} search={LINK} home={HOME} />)
  const title = () => screen.getByRole('heading', { level: 1 }).textContent
  expect(title()).toBe(VOTES.title)
  // The arrow keys show only where there is a keyboard; both clauses exist.
  expect(screen.getByText(VOTES.hint.touch).className).toContain(
    'pointer-fine:hidden',
  )
  expect(screen.getByText(VOTES.hint.keys).className).toContain(
    'pointer-fine:inline',
  )
  for (const name of [VOTES.yes, VOTES.no, VOTES.yes])
    await user.click(screen.getByRole('button', { name }))
  expect(title()).toBe(VOTES.review)
  await user.click(screen.getByRole('button', { name: VOTES.restart }))
  expect(title()).toBe(VOTES.title)
})

it('a redo that failed says the Votos were counted, in the title and the alert', () => {
  render(
    <VoteScreen
      deck={DECK}
      search={{ ...LINK, erro: 'regerar' }}
      home={HOME}
    />,
  )
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
    VOTES.stuck.regerar,
  )
  expect(screen.getByRole('alert').textContent).toBe(
    VOTES.refusals.regerar(null),
  )
})

it('without a deck, the way back to the link’s list', () => {
  render(<VoteScreen deck={null} search={LINK} home={HOME} />)
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
    VOTES.title,
  )
  expect(
    screen.getByRole('link', { name: VOTES.list }).getAttribute('href'),
  ).toBe(HOME)
})
