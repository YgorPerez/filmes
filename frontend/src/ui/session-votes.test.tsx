// @vitest-environment jsdom
// The group swipe's deck (#182): one film at a time, Não or Sim, and the
// form that posts every Voto at once.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { FETCH_HEADER } from '#/content/fetch-answer'
import { votePath, voteSearch } from '#/content/session-votes-address'
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
    '/participar/votar?sessao=2026-11-20-iara&chave=k&presente=iara&mudar=1',
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

  render(<VoteCards deck={voted} revote action="/participar/votos" />)
  expect(screen.getByText(VOTES.of(1, 2))).toBeTruthy()
  expect(posted()).toEqual([['versao', '3']])
})

it('the arrow keys vote, the next title takes the focus and is announced; the recap flips a Voto', async () => {
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

  await user.click(
    screen.getByRole('button', {
      name: VOTES.flip('Pequenos Milagres', 'no'),
    }),
  )
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
  ).toEqual({ feito: 'votado', erro: 'indisponivel', mudar: true })
  expect(voteSearch({ feito: 'x', erro: 3, mudar: 'sim' })).toEqual({
    feito: undefined,
    erro: undefined,
    mudar: undefined,
  })
})

// The sticker on the card, not the button of the same word.
const STAMP = { selector: 'span' }

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

it('a standing não goes again, the original title shows, and the recap flips a sim', async () => {
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
    screen.getByRole('button', {
      name: VOTES.flip('Pequenos Milagres', 'yes'),
    }),
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
