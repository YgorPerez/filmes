// @vitest-environment jsdom
// Each form of a Pessoa's page, as the Dono fills it: what it posts is the
// action the server runs (`parseAction`, the same reader the route uses).
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'
import {
  parseAction,
  PERSON_NOTICES,
  PERSON_REFUSALS,
} from '#/content/person-action'
import type { PersonPage } from '#/platform/people'
import { PERSON } from './person.copy'
import { CATALOG_SEARCH } from './catalog-search.copy'
import { PersonScreen } from './person'

afterEach(cleanup)

const IARA: PersonPage = {
  person: 'iara',
  name: 'Iara',
  aliases: ['ia'],
  owner: false,
  viewer: { person: 'bruno', name: 'Bruno' },
  vetoes: [
    {
      text: 'nunca vê terror',
      target: 'Q9001801',
      label: 'Terror',
      date: '2026-11-19',
      factId: 'vetos:1',
    },
  ],
  adjustments: [
    { link: 'cast', level: 'none', date: '2026-11-18', factId: 'ajustes:1' },
  ],
  stated: [
    {
      text: 'adoro os filmes dela',
      source: 'questionário',
      date: '2026-11-17',
      specific: true,
      reaction: 'love',
      target: 'Q9000018',
      label: 'Sofia Rangel',
      kind: 'stated',
      strength: 'strong',
      rating: null,
      factId: 'declarados:1',
    },
    {
      text: 'Ótimo',
      source: 'Letterboxd da Iara',
      date: '2025-01-01',
      specific: true,
      reaction: null,
      target: 'tt9000101',
      label: 'O Farol de Areia',
      kind: 'stated',
      strength: 'moderate',
      rating: null,
      factId: 'letterboxd:1',
    },
  ],
  reports: [
    {
      text: 'odeia filme lento',
      source: 'descrição do Dono',
      date: '2026-11-16',
      specific: false,
      reaction: null,
      target: null,
      label: null,
      kind: 'report',
      strength: 'weak',
      rating: null,
      factId: 'relatos:1',
    },
  ],
  seen: [
    {
      film: 'tt9000602',
      title: 'Casa Cheia',
      rating: 4.5,
      date: '2026-11-15',
      source: 'conversa com o Dono',
      factId: 'vistos:1',
    },
  ],
  openQuestions: [
    {
      text: 'a Iara curte terror?',
      subject: 'Q9001801',
      label: 'Terror',
      date: '2026-11-14',
      skips: 1,
      factId: 'perguntas_abertas:1',
    },
    {
      text: 'curte comédia boba?',
      subject: 'silly_comedy',
      label: 'comédia boba',
      date: '2026-11-14',
      skips: 1,
      factId: 'perguntas_abertas:2',
    },
  ],
  ratings: [
    {
      filmId: 'tt9000401',
      title: 'Fronteira',
      rating: 4,
      date: '2025-08-30',
      source: 'Letterboxd da Iara',
      kind: 'rating',
      factId: 'notas:1',
    },
  ],
  tagGroups: [
    { key: 'silly_comedy', label: 'comédia boba' },
    { key: 'slow', label: 'lento' },
  ],
}

const show = (page: PersonPage = IARA) =>
  render(<PersonScreen slug={page.person} page={page} />)

/** The form's action as the server reads it. */
const posted = (form: HTMLElement, person = 'iara') => {
  expect(form).toBeInstanceOf(HTMLFormElement)
  const element = form as HTMLFormElement
  expect(element.method).toBe('post')
  expect(new URL(element.action).pathname).toBe(`/pessoas/${person}/acao`)
  return parseAction(new FormData(element))
}

const section = (name: string) => screen.getByRole('region', { name })

/** Opens a `<details>` by its summary and gives the form in it. */
async function open(region: HTMLElement, summary: string) {
  const user = userEvent.setup()
  await user.click(within(region).getByText(summary))
  return { user, form: within(region).getByRole('form', { name: summary }) }
}

describe('PersonScreen forms', () => {
  beforeEach(() => {
    show()
  })

  it('records a Veto by id', async () => {
    const { user, form } = await open(
      section(PERSON.vetoes.title),
      PERSON.vetoes.add,
    )
    const fields = within(form)
    await user.type(
      fields.getByLabelText(PERSON.vetoes.text, { exact: false }),
      'nunca vê terror',
    )
    await user.type(fields.getByLabelText(/^Alvo/), 'Q9001801')
    expect(posted(form)).toEqual({
      kind: 'veto',
      text: 'nunca vê terror',
      target: 'Q9001801',
      group: false,
    })
  })

  it('records a Veto to a tag group', async () => {
    const { user, form } = await open(
      section(PERSON.vetoes.title),
      PERSON.vetoes.add,
    )
    const fields = within(form)
    await user.type(
      fields.getByLabelText(PERSON.vetoes.text, { exact: false }),
      'nada bobo',
    )
    await user.selectOptions(
      fields.getByLabelText(PERSON.group),
      'comédia boba',
    )
    expect(posted(form)).toEqual({
      kind: 'veto',
      text: 'nada bobo',
      target: 'silly_comedy',
      group: true,
    })
  })

  it('records a Declarado with a target and a reaction', async () => {
    const { user, form } = await open(
      section(PERSON.stated.title),
      PERSON.stated.add,
    )
    const fields = within(form)
    await user.type(fields.getByLabelText(PERSON.text), 'adora suspense')
    await user.type(fields.getByLabelText(/^Alvo/), 'Q9001801')
    await user.selectOptions(fields.getByLabelText(PERSON.reaction), 'ama')
    await user.type(
      fields.getByLabelText(PERSON.source, { exact: false }),
      'jantar',
    )
    expect(posted(form)).toEqual({
      kind: 'state',
      text: 'adora suspense',
      target: 'Q9001801',
      reaction: 'love',
      source: 'jantar',
    })
  })

  it('records a Relato with just the text', async () => {
    const { user, form } = await open(
      section(PERSON.reports.title),
      PERSON.reports.add,
    )
    await user.type(within(form).getByLabelText(PERSON.text), 'odeia musical')
    expect(posted(form)).toEqual({
      kind: 'report',
      text: 'odeia musical',
      target: undefined,
      reaction: undefined,
      source: undefined,
    })
  })

  it('records a Já visto with her Nota', async () => {
    const { user, form } = await open(
      section(PERSON.seen.title),
      PERSON.seen.add,
    )
    const fields = within(form)
    await user.type(
      fields.getByLabelText(PERSON.film, { exact: false }),
      'tt9000101',
    )
    await user.selectOptions(fields.getByLabelText(PERSON.rating), '3,5')
    expect(posted(form)).toEqual({
      kind: 'seen',
      film: 'tt9000101',
      rating: '3,5',
      source: undefined,
    })
  })

  it('changes an Ajuste, starting from the level she has', async () => {
    const user = userEvent.setup()
    const level = screen.getByLabelText(
      PERSON.adjustments.level(PERSON.links.cast),
      { exact: false },
    )
    expect(level).toHaveProperty('value', 'none')
    expect(
      screen.getByLabelText(PERSON.adjustments.level(PERSON.links.director), {
        exact: false,
      }),
    ).toHaveProperty('value', 'normal')
    await user.selectOptions(level, 'muito')
    expect(posted(level.closest('form')!)).toEqual({
      kind: 'adjust',
      link: 'cast',
      level: 'high',
    })
  })

  it('answers an open question about an entity, with a reaction', async () => {
    const question = IARA.openQuestions[0]!
    const user = userEvent.setup()
    // Two questions, two "Responder": the form names its question.
    const region = section(PERSON.questions.title)
    await user.click(within(region).getAllByText(PERSON.questions.answer)[0]!)
    const answer = within(region).getByRole('form', {
      name: `${PERSON.questions.answer}: ${question.text}`,
    })
    await user.type(
      within(answer).getByLabelText(PERSON.questions.answerText),
      'não gosta',
    )
    await user.selectOptions(
      within(answer).getByLabelText(PERSON.reaction, { exact: false }),
      'não gosta de',
    )
    expect(posted(answer)).toEqual({
      kind: 'answer',
      question: question.factId,
      text: 'não gosta',
      reaction: 'dislike',
    })
  })

  it('offers no reaction to a question about a tag group', async () => {
    const user = userEvent.setup()
    const region = section(PERSON.questions.title)
    await user.click(within(region).getAllByText(PERSON.questions.answer)[1]!)
    const answer = within(region).getByRole('form', {
      name: `${PERSON.questions.answer}: curte comédia boba?`,
    })
    expect(
      within(answer).queryByLabelText(PERSON.reaction, { exact: false }),
    ).toBeNull()
  })

  it.each([0, 1])('skips open question %i with its subject', (index) => {
    const question = IARA.openQuestions[index]!
    const skip = screen.getByRole('button', {
      name: `${PERSON.questions.skip}: ${question.text}`,
    })
    expect(posted(skip.closest('form')!)).toEqual({
      kind: 'skip',
      text: question.text,
      subject: question.subject,
    })
  })

  it.each([
    ['nunca vê terror', { what: 'veto', id: 'vetos:1' }],
    ['adoro os filmes dela', { what: 'stated', id: 'declarados:1' }],
    ['odeia filme lento', { what: 'report', id: 'relatos:1' }],
    ['Casa Cheia', { what: 'seen', id: 'vistos:1' }],
  ])('removes %s from her file', (label, removed) => {
    const button = screen.getByRole('button', {
      name: PERSON.removeLabel(label),
    })
    expect(posted(button.closest('form')!)).toEqual({
      kind: 'remove',
      ...removed,
    })
  })
})

describe('PersonScreen', () => {
  it('shows what came from an import, without a way to remove it', () => {
    show()
    expect(
      screen.queryByRole('button', { name: PERSON.removeLabel('Ótimo') }),
    ).toBeNull()
    expect(screen.getByText(PERSON.imported)).toBeTruthy()
  })

  it('shows her Notas with their count, and the Força of each Declarado', () => {
    show()
    expect(screen.getByText(PERSON.ratings.count(1))).toBeTruthy()
    expect(screen.getByText(/Fronteira/)).toBeTruthy()
    expect(
      screen.getByText(/ama Sofia Rangel \(Q9000018\) · específico · forte/),
    ).toBeTruthy()
  })

  it('has no Relato form on the logged-in Dono\'s own page: what he says is Declarado', () => {
    const own = { ...IARA, person: 'bruno', name: 'Bruno', owner: true }
    show({ ...own, reports: [] })
    expect(
      screen.queryByRole('region', { name: PERSON.reports.title }),
    ).toBeNull()
    expect(screen.getByText(PERSON.owner)).toBeTruthy()
    cleanup()
    // What another Dono told of his taste, he sees; he cannot add to it.
    show(own)
    const reports = section(PERSON.reports.title)
    expect(within(reports).getByText('“odeia filme lento”')).toBeTruthy()
    expect(within(reports).queryByText(PERSON.reports.add)).toBeNull()
  })

  it('takes a Relato about another Dono, told by the logged-in one', async () => {
    show({ ...IARA, person: 'vera', name: 'Vera', owner: true })
    expect(screen.getByText(PERSON.owner)).toBeTruthy()
    const { user, form } = await open(
      section(PERSON.reports.title),
      PERSON.reports.add,
    )
    const fields = within(form)
    expect(
      fields.getByText(PERSON.sourceHint(PERSON.reports.source('Bruno'))),
    ).toBeTruthy()
    await user.type(fields.getByLabelText(PERSON.text), 'adora suspense')
    expect(posted(form, 'vera')).toEqual({
      kind: 'report',
      text: 'adora suspense',
      target: undefined,
      reaction: undefined,
      source: undefined,
    })
  })

  it.each(PERSON_NOTICES)('says what happened: %s', (notice) => {
    render(<PersonScreen slug="iara" page={IARA} notice={notice} />)
    expect(screen.getByRole('status').textContent).toBe(PERSON.notices[notice])
  })

  it.each(PERSON_REFUSALS)('says why not: %s', (refusal) => {
    render(<PersonScreen slug="iara" page={IARA} refusal={refusal} />)
    expect(screen.getByRole('alert').textContent).toContain(
      PERSON.refusals[refusal],
    )
  })

  it('says when no Pessoa has the name, or the engine cannot run', () => {
    render(<PersonScreen slug="ninguem" page="unknown" />)
    expect(screen.queryByRole('search')).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain(PERSON.unknown)
    cleanup()
    render(<PersonScreen slug="iara" page={null} />)
    expect(screen.getByRole('alert').textContent).toContain(PERSON.unavailable)
    expect(screen.queryByRole('form')).toBeNull()
  })

  it('says when there is nothing yet', () => {
    show({
      ...IARA,
      vetoes: [],
      stated: [],
      reports: [],
      seen: [],
      openQuestions: [],
      ratings: null,
    })
    for (const empty of [
      PERSON.vetoes.empty,
      PERSON.stated.empty,
      PERSON.reports.empty,
      PERSON.seen.empty,
      PERSON.questions.empty,
      PERSON.ratings.noDatabase,
    ])
      expect(screen.getByText(empty)).toBeTruthy()
  })
})

describe('the Catálogo search', () => {
  it('looks for any kind and comes back to her page', () => {
    render(
      <PersonScreen
        slug="iara"
        page={IARA}
        search={{ query: 'é', refused: 'curta' }}
      />,
    )
    const form = screen.getByRole('search') as HTMLFormElement
    expect(form.method).toBe('get')
    expect(new URL(form.action).pathname).toBe('/pessoas/iara')
    expect(screen.getByText(CATALOG_SEARCH.leadAll)).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain(
      CATALOG_SEARCH.refusals.curta,
    )
  })
})
