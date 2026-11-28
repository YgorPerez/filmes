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
import { BILLBOARD } from './billboard.copy'
import { NEW_STICKER } from './kit/sticker'
import { SHEET } from './film-sheet.copy'
import {
  GUEST_DECK as DECK,
  GUEST_FILMS as FILMS,
  IARA_SEES,
  OWNER_DECK,
} from './session-votes.fixture'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

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
  // Two sins: the recap leads to her Ordem, which sends (#379).
  expect(screen.queryByRole('button', { name: VOTES.send })).toBeNull()
  expect(document.querySelector('form')?.getAttribute('action')).toBe(
    '/participar/votos?sessao=s',
  )
  const votes = [
    ['versao', '2'],
    ['sim', 'tt9000101'],
    ['nao', 'tt9000601'],
    ['sim', 'tt9000701'],
  ]
  expect(posted()).toEqual(votes)
  await user.click(screen.getByRole('button', { name: VOTES.rankStart }))
  expect(screen.getByRole('button', { name: VOTES.send })).toBeTruthy()
  expect(posted()).toEqual([
    ...votes,
    ['ordem', 'tt9000101'],
    ['ordem', 'tt9000701'],
  ])
  await user.click(screen.getByRole('button', { name: VOTES.rankBack }))
  expect(document.activeElement?.textContent).toBe(VOTES.summary(2, 1))
  expect(posted()).toEqual(votes)

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
  for (const name of [VOTES.yes, VOTES.no, VOTES.yes, VOTES.rankStart]) {
    await user.click(screen.getByRole('button', { name }))
  }
  const fields = posted()
  await user.click(screen.getByRole('button', { name: VOTES.send }))

  const sending = screen.getByRole<HTMLButtonElement>('button', {
    name: 'Enviando votos…',
  })
  expect(sending.disabled).toBe(true)
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: VOTES.rankBack })
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
  expect(screen.getByText(VOTES.rankTitle)).toBeTruthy()
  expect(posted()).toEqual(fields)
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: VOTES.send })
      .disabled,
  ).toBe(false)
})

it('the NOVO sticker on a film that came in after her last Voto only (#380)', async () => {
  const user = userEvent.setup()
  const films = [FILMS[0]!, { ...FILMS[1]!, new: true }]
  render(<VoteScreen deck={{ ...DECK, films }} search={LINK} home={HOME} />)
  const card = () => screen.getByRole('article', { name: /./u })
  expect(within(card()).queryByText(NEW_STICKER)).toBeNull()
  await user.click(screen.getByRole('button', { name: VOTES.yes }))
  expect(within(card()).getByText(NEW_STICKER)).toBeTruthy()
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
      deck={{ version: 3, films, left: ['Sal e Ferrugem'], people: IARA_SEES }}
      search={LINK}
      home={HOME}
      questions="/participar/perguntas?x"
      owner="Bruno"
    />,
  )

  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
    VOTES.voted,
  )
  // The same order as the film list (pass 5 F2): the Perguntas, then
  // Mudar votos, and who sees the answers.
  expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual([
    VOTES.questions,
    VOTES.revote,
  ])
  expect(screen.getByText(PARTICIPATION.questionsLead('Bruno'))).toBeTruthy()
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
      deck={{ version: 3, films, left: [], people: IARA_SEES }}
      search={{ ...LINK, feito: 'regerada' }}
      home={HOME}
    />,
  )

  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(VOTES.sent)
  // No "Cada não" after a single não: the line under the list names what
  // left (pass 5 F3).
  expect(screen.getByRole('status').textContent).toBe(
    'Votos contados. A lista foi refeita.',
  )
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
  const deck = {
    version: 3,
    films,
    left: [],
    people: IARA_SEES,
    stale: ['Quermesse'],
  }
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
    people: IARA_SEES,
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
    people: IARA_SEES,
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
  expect(card.style.transform).toBe('translate(50px, 0px) rotate(3deg)')
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
      deck={{ version: 4, films, left: [], people: IARA_SEES }}
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
      deck={{ version: 3, films, left: [], people: IARA_SEES }}
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
      deck={{ version: 3, films, left: [], people: IARA_SEES }}
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

// The full-screen card and its full sheet (#377).

const sheetOf = () => within(screen.getByRole('dialog'))

it('a tap on the card opens the full sheet with the public facts and only her own Evidence and Nota prevista', async () => {
  const user = userEvent.setup()
  render(<VoteCards deck={DECK} action="/participar/votos" />)
  // The card: her own Nota prevista beside the IMDb.
  expect(screen.getByText('2012 · 1h44 · IMDb 7,6 · previsto 7,1')).toBeTruthy()

  await user.click(screen.getByRole('article'))

  const sheet = sheetOf()
  expect(sheet.getByRole('heading', { name: 'O Farol de Areia' })).toBeTruthy()
  expect(
    sheet.getByRole('link', { name: '7,6 IMDb · 12 mil votos' }),
  ).toHaveProperty('href', 'https://www.imdb.com/title/tt9000101/')
  expect(sheet.getByRole('link', { name: 'trailer' })).toBeTruthy()
  expect(sheet.getByText('Vencedor do Oscar de Melhor Fotografia')).toBeTruthy()
  expect(sheet.getByText('93% no Rotten Tomatoes')).toBeTruthy()
  expect(
    sheet.getByText(
      'Uma faroleira descobre que a ilha onde vive está afundando.',
    ),
  ).toBeTruthy()
  expect(sheet.getByText('Por que você vai gostar')).toBeTruthy()
  const why = within(sheet.getByRole('list', { name: 'Por que' }))
  expect(why.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
    'Você: deu 9 de 10 a Fronteira (2008), também de Helena PradoLetterboxd, 2025-03-02',
  ])
  expect(sheet.getByText(/previsto/u).textContent).toBe('previsto · Você 7,1')
  expect(sheet.queryByText(/Bruno|Quim|8,3/u)).toBeNull()
})

it('the Dono’s sheet has every Presente’s Evidence and Nota prevista; the card, her own', async () => {
  const user = userEvent.setup()
  render(<VoteCards deck={OWNER_DECK} action="/participar/votos" />)
  expect(screen.getByText('2012 · 1h44 · IMDb 7,6 · previsto 8,3')).toBeTruthy()

  await user.click(screen.getByRole('button', { name: VOTES.more }))

  const sheet = sheetOf()
  expect(sheet.getByText(BILLBOARD.card.why)).toBeTruthy()
  const why = within(sheet.getByRole('list', { name: 'Por que' }))
  expect(why.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
    'Você: dirigido por Helena Prado, como 2 filmes a que deu nota alta',
    'Iara: deu 9 de 10 a Fronteira (2008), também de Helena PradoLetterboxd, 2025-03-02',
    'Quim: sem fato sobre este filme',
  ])
  // Her name carries the hint of how many neighbours back it.
  expect(sheet.getByText(/previsto/u).textContent).toMatch(
    /^previsto · Você.+ 8,3 · Iara 7,1$/u,
  )
})

it('votes from the sheet, closes it with Fechar, and the arrow keys wait while it is open', async () => {
  const user = userEvent.setup()
  render(<VoteCards deck={DECK} action="/participar/votos" />)

  await user.click(screen.getByRole('button', { name: VOTES.more }))
  await user.keyboard('{ArrowRight}')
  expect(screen.getByRole('dialog')).toBeTruthy()
  await user.click(sheetOf().getByRole('button', { name: SHEET.close }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement?.textContent).toBe('O Farol de Areia')

  await user.click(screen.getByRole('article'))
  await user.click(sheetOf().getByRole('button', { name: VOTES.yes }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(
    screen.getByRole('heading', { name: 'Pequenos Milagres' }),
  ).toBeTruthy()
  expect(posted()).toEqual([
    ['versao', '2'],
    ['sim', 'tt9000101'],
  ])
})

it('★ and ↑ are vi e gostei, 👎 and ↓ vi e não gostei; the recap counts them and says they leave', async () => {
  const user = userEvent.setup()
  render(<VoteCards deck={DECK} action="/participar/votos" />)

  await user.click(screen.getByRole('button', { name: VOTES.seenLiked }))
  expect(screen.getByRole('status').textContent).toBe(
    VOTES.now(2, 3, 'Pequenos Milagres'),
  )
  await user.keyboard('{ArrowDown}')
  await user.keyboard('{ArrowUp}')

  expect(screen.getByRole('status').textContent).toBe(VOTES.end(0, 0, 3))
  expect(
    screen.getByRole('heading', { name: VOTES.summary(0, 0, 3) }),
  ).toBeTruthy()
  expect(
    screen.getByText(
      VOTES.leaving([
        'O Farol de Areia',
        'Pequenos Milagres',
        'Noite de Estreia',
      ]),
    ),
  ).toBeTruthy()
  const row = within(
    screen.getByRole('group', { name: VOTES.voteOn('Pequenos Milagres') }),
  )
  expect(
    row
      .getByRole('button', { name: VOTES.seenDisliked })
      .getAttribute('aria-pressed'),
  ).toBe('true')
  await user.click(row.getByRole('button', { name: VOTES.yes }))
  expect(posted()).toEqual([
    ['versao', '2'],
    ['gostei', 'tt9000101'],
    ['sim', 'tt9000601'],
    ['gostei', 'tt9000701'],
  ])
  expect(
    screen.getByRole('heading', { name: VOTES.summary(1, 0, 2) }),
  ).toBeTruthy()
})

it('a drag up is vi e gostei and down vi e não gostei, with their stickers', () => {
  motion(false)
  render(<VoteCards deck={DECK} action="/participar/votos" />)
  const card = () => screen.getByRole('article')

  fireEvent.pointerDown(card(), { clientX: 200, clientY: 400 })
  fireEvent.pointerMove(card(), { clientX: 210, clientY: 340 })
  expect(screen.getByText(VOTES.stampSeenLiked, STAMP)).toBeTruthy()
  expect(card().style.transform).toBe('translate(10px, -60px) rotate(0.6deg)')
  fireEvent.pointerUp(card(), { clientX: 210, clientY: 300 })

  fireEvent.pointerDown(card(), { clientX: 200, clientY: 300 })
  fireEvent.pointerMove(card(), { clientX: 200, clientY: 360 })
  expect(screen.getByText(VOTES.stampSeenDisliked, STAMP)).toBeTruthy()
  fireEvent.pointerUp(card(), { clientX: 200, clientY: 400 })

  expect(posted()).toEqual([
    ['versao', '2'],
    ['gostei', 'tt9000101'],
    ['naogostei', 'tt9000601'],
  ])
})

it('without a sheet the card still votes, and the sheet has the titles alone', async () => {
  const user = userEvent.setup()
  const films = DECK.films.map((f) => ({ ...f, sheet: null }))
  render(<VoteCards deck={{ ...DECK, films }} action="/participar/votos" />)
  expect(screen.getByText('2012 · 1h44 · IMDb 7,6')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: VOTES.more }))
  expect(sheetOf().queryByRole('list', { name: 'Por que' })).toBeNull()
  expect(sheetOf().queryByRole('link')).toBeNull()
})

// Her Ordem (#379).

const order = () =>
  within(screen.getByRole('list', { name: VOTES.rankList }))
    .getAllByRole('listitem')
    .map((li) => within(li).getByText(/^\d+\.$/u).parentElement?.textContent)

const voteAll = async (user: ReturnType<typeof userEvent.setup>) => {
  for (const name of [VOTES.yes, VOTES.yes, VOTES.yes, VOTES.rankStart])
    await user.click(screen.getByRole('button', { name }))
}

it('her sins start in the engine’s order; the handle moves a film with ↑ ↓ and says where it went', async () => {
  const user = userEvent.setup()
  render(<VoteScreen deck={DECK} search={LINK} home={HOME} />)
  await voteAll(user)

  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
    VOTES.rankPage,
  )
  expect(document.activeElement?.textContent).toBe(VOTES.rankTitle)
  expect(order()).toEqual([
    '1. O Farol de Areia',
    '2. Pequenos Milagres',
    '3. Noite de Estreia',
  ])
  const handle = screen.getByRole('button', {
    name: VOTES.rankMove('Noite de Estreia', 3, 3),
  })
  handle.focus()
  await user.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}')
  expect(order()).toEqual([
    '1. Noite de Estreia',
    '2. O Farol de Areia',
    '3. Pequenos Milagres',
  ])
  expect(screen.getAllByRole('status')[0]?.textContent).toBe(
    VOTES.rankMoved('Noite de Estreia', 1, 3),
  )
  await user.keyboard('{ArrowDown}')
  expect(posted().filter(([name]) => name === 'ordem')).toEqual([
    ['ordem', 'tt9000101'],
    ['ordem', 'tt9000701'],
    ['ordem', 'tt9000601'],
  ])
})

it('a drag by the handle moves the film to the row under the pointer', async () => {
  const user = userEvent.setup()
  render(<VoteCards deck={DECK} action="/participar/votos" />)
  await voteAll(user)
  const rows = within(
    screen.getByRole('list', { name: VOTES.rankList }),
  ).getAllByRole('listitem')
  rows.forEach((row, i) => {
    row.getBoundingClientRect = () => ({ top: i * 100, height: 100 }) as DOMRect
  })
  const handle = screen.getByRole('button', {
    name: VOTES.rankMove('O Farol de Areia', 1, 3),
  })
  fireEvent.pointerDown(handle, { clientY: 50 })
  fireEvent.pointerMove(handle, { clientY: 60 })
  expect(order()[0]).toBe('1. O Farol de Areia')
  fireEvent.pointerMove(handle, { clientY: 260 })
  fireEvent.pointerUp(handle, { clientY: 260 })
  fireEvent.pointerMove(handle, { clientY: 10 })
  expect(order()).toEqual([
    '1. Pequenos Milagres',
    '2. Noite de Estreia',
    '3. O Farol de Areia',
  ])
})

it('a tap on a film opens its sheet; its Não takes the film out like the swipe’s não', async () => {
  const user = userEvent.setup()
  render(<VoteCards deck={DECK} action="/participar/votos" />)
  await voteAll(user)

  await user.click(screen.getByRole('button', { name: '2. Pequenos Milagres' }))
  expect(
    sheetOf().getByRole('heading', { name: 'Pequenos Milagres' }),
  ).toBeTruthy()
  await user.click(sheetOf().getByRole('button', { name: VOTES.rankNo }))

  expect(screen.queryByRole('dialog')).toBeNull()
  expect(order()).toEqual(['1. O Farol de Areia', '2. Noite de Estreia'])
  expect(posted()).toEqual([
    ['versao', '2'],
    ['sim', 'tt9000101'],
    ['nao', 'tt9000601'],
    ['sim', 'tt9000701'],
    ['ordem', 'tt9000101'],
    ['ordem', 'tt9000701'],
  ])

  // One sim left: no Ordem, the recap sends.
  await user.click(screen.getByRole('button', { name: '2. Noite de Estreia' }))
  await user.click(sheetOf().getByRole('button', { name: VOTES.rankNo }))
  expect(screen.queryByRole('list', { name: VOTES.rankList })).toBeNull()
  expect(document.activeElement?.textContent).toBe(VOTES.summary(1, 2))
  expect(screen.getByRole('button', { name: VOTES.send })).toBeTruthy()
})

it('the film that came in after her Ordem goes in its middle; a não on a standing sim goes as não', async () => {
  const user = userEvent.setup()
  const deck = {
    version: 3,
    films: [
      { ...FILMS[0]!, mine: 'yes' as const },
      { ...FILMS[1]!, mine: 'yes' as const },
      FILMS[2]!,
    ],
    left: [],
    people: IARA_SEES,
    ranking: ['tt9000601', 'tt9000101'],
  }
  render(<VoteCards deck={deck} action="/participar/votos" />)
  expect(screen.getByText(VOTES.of(1, 1))).toBeTruthy()
  await user.click(screen.getByRole('button', { name: VOTES.yes }))
  await user.click(screen.getByRole('button', { name: VOTES.rankStart }))

  expect(order()).toEqual([
    '1. Pequenos Milagres',
    '2. Noite de Estreia',
    '3. O Farol de Areia',
  ])
  await user.click(screen.getByRole('button', { name: '3. O Farol de Areia' }))
  await user.click(sheetOf().getByRole('button', { name: VOTES.rankNo }))
  expect(posted()).toEqual([
    ['versao', '3'],
    ['nao', 'tt9000101'],
    ['sim', 'tt9000601'],
    ['sim', 'tt9000701'],
    ['ordem', 'tt9000601'],
    ['ordem', 'tt9000701'],
  ])
})

it('mudar opens her Ordem as she left it', async () => {
  const user = userEvent.setup()
  const deck = {
    version: 3,
    films: FILMS.map((f) => ({ ...f, mine: 'yes' as const })),
    left: [],
    people: IARA_SEES,
    ranking: ['tt9000701', 'tt9000101', 'tt9000601'],
  }
  render(<VoteCards deck={deck} revote action="/participar/votos" />)
  await user.click(screen.getByRole('button', { name: VOTES.rankStart }))
  expect(order()).toEqual([
    '1. Noite de Estreia',
    '2. O Farol de Areia',
    '3. Pequenos Milagres',
  ])
})
