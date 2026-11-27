// @vitest-environment jsdom
// The Presente's side of the Link da Sessão (#180, #275): the names, the
// night's list with Votar, and the link that no longer opens.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vite-plus/test'
import {
  FilmCover,
  LinkFilms,
  LinkHeader,
  LinkPicker,
  LinkUnavailable,
} from './session-link'
import { PARTICIPATION } from './session-link.copy'
import { PEOPLE, VIEW, VOTED } from './session-link.fixture'
import { VOTES } from './session-votes.copy'

afterEach(cleanup)

const VOTE = { deck: '/votar', revote: '/votar?mudar=1' }

const link = (name: string | RegExp) => screen.getByRole('link', { name })

it('asks who she is, marks the Dono and warns about a name not in the Session', () => {
  render(
    <LinkPicker
      view={{ ...VIEW, selected: null }}
      hrefFor={(person) => `/participar?presente=${person}`}
      unknown
    />,
  )
  expect(screen.getByRole('heading', { name: PARTICIPATION.pick })).toBeTruthy()
  expect(screen.getByRole('status').textContent).toBe(
    PARTICIPATION.unknownPerson,
  )
  expect(link(/Bruno/u).textContent).toContain(PARTICIPATION.opened)
  expect(link('Iara').getAttribute('href')).toBe('/participar?presente=iara')
  expect(screen.getByText(/Bruno chamou você/u)).toBeTruthy()
})

it('without an owner, the picker invites to the night and shows no warning', () => {
  render(<LinkPicker view={{ ...VIEW, owner: null }} hrefFor={() => '/x'} />)
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.getByText(/Escolha o filme da noite/u)).toBeTruthy()
})

it('tells a closed Session from a broken link', () => {
  render(<LinkUnavailable closed />)
  expect(
    screen.getByRole('heading', { name: PARTICIPATION.unavailable.closed }),
  ).toBeTruthy()
  expect(screen.getByText(PARTICIPATION.unavailable.closedLead)).toBeTruthy()
  cleanup()
  render(<LinkUnavailable closed={false} />)
  expect(
    screen.getByRole('heading', { name: PARTICIPATION.unavailable.broken }),
  ).toBeTruthy()
  expect(screen.getByText(PARTICIPATION.unavailable.brokenLead)).toBeTruthy()
})

it('heads her pages with her name and the way back to the names', () => {
  render(<LinkHeader person={PEOPLE[1]!} notYou="/participar?sessao=s" />)
  expect(screen.getByText('Iara')).toBeTruthy()
  expect(link(PARTICIPATION.notYou).getAttribute('href')).toBe(
    '/participar?sessao=s',
  )
})

it('before any Voto, lists the films and asks for every Voto', () => {
  render(<LinkFilms view={VIEW} vote={VOTE} questions="/perguntas" />)
  const list = screen.getByRole('list', { name: PARTICIPATION.films })
  expect(list.querySelectorAll('li')).toHaveLength(3)
  expect(screen.getByText(PARTICIPATION.lead(3))).toBeTruthy()
  expect(screen.getAllByText('IMDb 7,6')).toHaveLength(3)
  expect(link(PARTICIPATION.vote).getAttribute('href')).toBe('/votar')
  expect(link(VOTES.questions).getAttribute('href')).toBe('/perguntas')
  expect(screen.getByText(PARTICIPATION.questionsLead('Bruno'))).toBeTruthy()
  expect(screen.queryByText(new RegExp(PARTICIPATION.left, 'u'))).toBeNull()
})

it('after her Votos, marks them, names what left and asks only for the newcomer', () => {
  render(<LinkFilms view={VOTED} vote={VOTE} questions="/perguntas" />)
  expect(screen.getAllByText(PARTICIPATION.mine('yes'))).toHaveLength(2)
  expect(screen.queryByText('Novo')).toBeNull()
  expect(
    screen.getByText(`${PARTICIPATION.left}: Sal e Ferrugem.`),
  ).toBeTruthy()
  expect(link(PARTICIPATION.voteNew(1)).getAttribute('href')).toBe('/votar')
})

it('with every film voted, offers to change the Votos; without questions, no invite', () => {
  const films = VOTED.films.map((f) => ({ ...f, mine: 'no' as const }))
  render(
    <LinkFilms
      view={{ ...VOTED, films, questions: 0, owner: null }}
      vote={VOTE}
      questions="/perguntas"
    />,
  )
  expect(screen.getAllByText(PARTICIPATION.mine('no'))).toHaveLength(3)
  expect(link(PARTICIPATION.revote).getAttribute('href')).toBe('/votar?mudar=1')
  expect(screen.queryByText(PARTICIPATION.questionsTitle)).toBeNull()
})

it('a film without year or duration shows only its genres', () => {
  const [first] = VIEW.films
  const film = {
    ...first!,
    card: { ...first!.card!, year: null, duration: null, imdbRating: null },
  }
  render(
    <LinkFilms
      view={{ ...VIEW, films: [film] }}
      vote={VOTE}
      questions="/perguntas"
    />,
  )
  expect(screen.getByText(PARTICIPATION.lead(1))).toBeTruthy()
  expect(screen.getByText('Drama')).toBeTruthy()
  expect(screen.queryByText(/IMDb/u)).toBeNull()
})

it('a Session without films says so and has no Votar', () => {
  render(
    <LinkFilms
      view={{ ...VIEW, films: [] }}
      vote={VOTE}
      questions="/perguntas"
    />,
  )
  expect(screen.getByText(PARTICIPATION.empty)).toBeTruthy()
  expect(screen.queryByRole('link', { name: PARTICIPATION.vote })).toBeNull()
})

it('a tape shows the poster, else the title, and a small one stays blank', () => {
  const { container } = render(
    <>
      <FilmCover poster="/p.jpg" title="Com pôster" eager />
      <FilmCover poster="/q.jpg" title="Preguiçoso" />
      <FilmCover poster={null} title="Sem pôster" />
      <FilmCover poster={null} title="Pequeno" small />
    </>,
  )
  const images = [...container.querySelectorAll('img')]
  expect(images.map((img) => img.getAttribute('loading'))).toEqual([
    'eager',
    'lazy',
  ])
  expect(screen.getByText('Sem pôster')).toBeTruthy()
  expect(screen.queryByText('Pequeno')).toBeNull()
})
