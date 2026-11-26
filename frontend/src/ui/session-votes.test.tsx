// @vitest-environment jsdom
// The group swipe's deck (#182): one film at a time, Não or Sim, and the
// form that posts every Voto at once.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vite-plus/test'
import { voteSearch } from '#/content/session-votes-address'
import { VOTES } from './session-votes.copy'
import { VoteCards, VoteScreen } from './session-votes'

afterEach(cleanup)

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
  drag(200, 40)
  drag(40, 200)

  expect(posted()).toEqual([
    ['versao', '2'],
    ['nao', 'tt9000101'],
    ['sim', 'tt9000601'],
  ])
})

const LINK = { sessao: '2026-11-20-iara', chave: 'k', presente: 'iara' }

it('the page posts the link’s search and says what the last post did', () => {
  render(<VoteScreen deck={DECK} search={{ ...LINK, feito: 'regerada' }} />)

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
    />,
  )

  expect(screen.getByRole('alert').textContent).toBe(VOTES.refusals.regerar)
  expect(screen.getByText(VOTES.done)).toBeTruthy()
  expect(
    screen.getByRole('link', { name: VOTES.refresh }).getAttribute('href'),
  ).toBe('/participar/votar?sessao=2026-11-20-iara&chave=k&presente=iara')
  expect(
    screen.getByRole('link', { name: VOTES.list }).getAttribute('href'),
  ).toBe('/participar?sessao=2026-11-20-iara&chave=k&presente=iara')
})

it('without a link there is no deck and no list', () => {
  render(<VoteScreen deck={null} search={{}} />)

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
