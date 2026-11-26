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

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const DECK = {
  version: 2,
  films: [
    { position: 1, id: 'tt9000101', title: 'O Farol de Areia' },
    { position: 2, id: 'tt9000601', title: 'Pequenos Milagres' },
    { position: 3, id: 'tt9000701', title: 'Noite de Estreia' },
  ],
}

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

  expect(screen.getByText(VOTES.summary(2, 1))).toBeTruthy()
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
    VOTES.refusals.indisponivel,
  )
  expect(screen.getByText(VOTES.summary(2, 1))).toBeTruthy()
  expect(posted()).toEqual(fields)
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: VOTES.send })
      .disabled,
  ).toBe(false)
})

it('the page posts the link’s search and says what the last post did', () => {
  render(
    <VoteScreen
      deck={DECK}
      search={{ ...LINK, feito: 'regerada' }}
      home={HOME}
    />,
  )

  expect(screen.getByRole('status').textContent).toBe(VOTES.notices.regerada)
  expect(screen.queryByRole('alert')).toBeNull()
  expect(document.querySelector('form')?.getAttribute('action')).toBe(
    '/participar/votos?sessao=2026-11-20-iara&chave=k&presente=iara',
  )
})

it('with every film voted on, it offers to look again and the list', () => {
  render(
    <VoteScreen
      deck={{ version: 2, films: [] }}
      search={{ ...LINK, erro: 'regerar' }}
      home={HOME}
    />,
  )

  expect(screen.getByRole('alert').textContent).toBe(VOTES.refusals.regerar)
  expect(screen.getByText(VOTES.done)).toBeTruthy()
  expect(
    screen.getByRole('link', { name: VOTES.refresh }).getAttribute('href'),
  ).toBe('/participar/votar?sessao=2026-11-20-iara&chave=k&presente=iara')
  expect(
    screen.getByRole('link', { name: VOTES.list }).getAttribute('href'),
  ).toBe(HOME)
})

it('without a link there is no deck and no list', () => {
  render(<VoteScreen deck={null} search={{}} home={null} />)

  expect(screen.queryByRole('form')).toBeNull()
  expect(screen.queryByRole('link', { name: VOTES.list })).toBeNull()
})

it('the page’s search keeps only the notices and refusals it knows', () => {
  expect(voteSearch({ feito: 'votado', erro: 'indisponivel' })).toEqual({
    feito: 'votado',
    erro: 'indisponivel',
  })
  expect(voteSearch({ feito: 'x', erro: 3 })).toEqual({
    feito: undefined,
    erro: undefined,
  })
})
