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
import {
  RATING_SCREEN_SOURCE,
  SETUP_STEPS,
  type SetupStep,
} from '@filmes/engine'
import type { SetupView } from '#/platform/setup-guide'
import { MY_START } from './my-start.copy'
import type { MyStart } from './my-start'
import { PersonScreen } from './person'

afterEach(cleanup)

const IARA: PersonPage = {
  person: 'iara',
  name: 'Iara',
  aliases: ['ia'],
  owner: false,
  viewer: { person: 'bruno', name: 'Bruno', admin: false },
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
    await user.selectOptions(fields.getByLabelText(PERSON.rating), '7')
    expect(posted(form)).toEqual({
      kind: 'seen',
      film: 'tt9000101',
      rating: '7/10',
      source: undefined,
    })
  })

  it('marks the field a Veto lacks, and keeps the post', async () => {
    const { user, form } = await open(
      section(PERSON.vetoes.title),
      PERSON.vetoes.add,
    )
    const fields = within(form)
    await user.type(
      fields.getByLabelText(PERSON.vetoes.text, { exact: false }),
      'nada bobo',
    )
    await user.click(fields.getByRole('button', { name: PERSON.save }))
    const target = fields.getByRole('textbox', { name: /^Alvo/ })
    expect(target.getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(target)
    const said = document.getElementById(
      target.getAttribute('aria-describedby') ?? '',
    )
    expect(said?.textContent).toBe(
      PERSON.fieldProblem({ field: 'alvo', problem: 'target' }),
    )
    await user.type(target, 'Q')
    expect(target.getAttribute('aria-invalid')).toBeNull()
  })

  it('shows her Notas on the 1 to 10 scale she gives them on', () => {
    const notes = section(PERSON.notes.title)
    expect(notes.textContent).toContain(
      'nota 8 · 30 ago 2025 · 4★ no Letterboxd da Iara',
    )
  })

  it('changes an Ajuste, starting from the level she has', async () => {
    const user = userEvent.setup()
    const picker = (link: string) =>
      screen.getByRole('group', {
        name: new RegExp(`^${PERSON.adjustments.level(link)}`),
      })
    const cast = picker(PERSON.links.cast)
    expect(
      within(cast).getByRole('radio', { name: PERSON.levels.none }),
    ).toHaveProperty('checked', true)
    expect(
      within(picker(PERSON.links.director)).getByRole('radio', {
        name: PERSON.levels.normal,
      }),
    ).toHaveProperty('checked', true)
    await user.click(
      within(cast).getByRole('radio', { name: PERSON.levels.high }),
    )
    expect(posted(cast.closest('form')!)).toEqual({
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

  it('opens with a link to each ficha, with how many it holds', () => {
    show()
    const contents = screen.getByRole('navigation', { name: PERSON.contents })
    const vetoes = within(contents).getByRole('link', {
      name: `${PERSON.vetoes.title} 1`,
    })
    expect(vetoes.getAttribute('href')).toBe('#vetos')
    expect(document.getElementById('vetos')?.closest('section')).toBe(
      section(PERSON.vetoes.title),
    )
  })

  it('shows the Força of each Declarado', () => {
    show()
    const stated = screen
      .getByText('“adoro os filmes dela”')
      .closest('li') as HTMLElement
    expect(
      within(stated).getByText(/ama Sofia Rangel · específico/),
    ).toBeTruthy()
    expect(
      within(stated).getByRole('img', { name: 'Força forte' }),
    ).toBeTruthy()
  })

  it("has no Relato form on the logged-in Dono's own page: what he says is Declarado", () => {
    const own = { ...IARA, person: 'bruno', name: 'Bruno', owner: true }
    show({ ...own, reports: [] })
    expect(
      screen.queryByRole('region', { name: PERSON.reports.title }),
    ).toBeNull()
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
      PERSON.notes.noDatabase,
    ])
      expect(screen.getByText(empty)).toBeTruthy()
  })
})

const link = (region: HTMLElement, name: string) =>
  within(region).getByRole('link', { name }).getAttribute('href')

describe('the Notas section', () => {
  it('comes first, with her Notas, her import and her CSV', async () => {
    show()
    const notes = section(PERSON.notes.title)
    expect(screen.getAllByRole('region')[0], 'Notas is the first section').toBe(
      notes,
    )
    expect(link(notes, PERSON.notes.import)).toBe('/pessoas/iara/importar')
    expect(link(notes, PERSON.notes.download)).toBe(
      '/exportar/imdb.csv?pessoa=iara',
    )
    expect(within(notes).getByText(PERSON.notes.movielens)).toBeTruthy()
    // The rating queue is the logged-in Dono's: not on another's page.
    expect(
      within(notes).queryByRole('link', { name: PERSON.notes.rate }),
    ).toBeNull()
    await userEvent.setup().click(within(notes).getByText(PERSON.notes.list(1)))
    expect(within(notes).getByText(/Fronteira/)).toBeTruthy()
  })

  it('offers no CSV without a Nota, and says how to get some', () => {
    show({ ...IARA, ratings: [] })
    const notes = section(PERSON.notes.title)
    expect(
      within(notes).queryByRole('link', { name: PERSON.notes.download }),
    ).toBeNull()
    expect(within(notes).getByText(PERSON.notes.empty(false))).toBeTruthy()
  })

  it('is Meu gosto’s first section, with Dar notas as its one orange button', () => {
    show({ ...IARA, person: 'bruno', name: 'Bruno', owner: true })
    expect(
      screen.getByRole('heading', { level: 1, name: PERSON.myTaste }),
    ).toBeTruthy()
    const notes = section(PERSON.notes.title)
    expect(link(notes, PERSON.notes.rate)).toBe('/meu-gosto/notas')
    expect(link(notes, PERSON.notes.import)).toBe('/meu-gosto/importar')
    expect(link(notes, PERSON.notes.download)).toBe(
      '/exportar/imdb.csv?pessoa=bruno',
    )
    // No way back to Pessoas: Meu gosto is a tab of its own.
    expect(screen.queryByRole('link', { name: PERSON.back })).toBeNull()
  })
})

describe('Meu gosto’s start', () => {
  const OWN = { ...IARA, person: 'bruno', name: 'Bruno', owner: true }
  const MCP = 'https://filmes.example/mcp'
  const setup = (
    state: Partial<Record<SetupStep, 'done' | 'skipped'>> = {},
  ): SetupView => ({
    ratings: 3,
    steps: SETUP_STEPS.map((step) => ({
      step,
      done: state[step] === 'done',
      skipped: state[step] === 'skipped',
    })),
  })
  const mine = (start: MyStart) =>
    render(<PersonScreen slug="bruno" page={OWN} start={start} />)

  it('always shows the connector’s address, and how to add it', () => {
    mine({ setup: setup(), mcpUrl: MCP })
    const connector = section(MY_START.connector.title)
    expect(within(connector).getByText(MCP)).toBeTruthy()
    expect(
      within(connector).getByRole('button', { name: /Copiar endereço/ }),
    ).toBeTruthy()
    expect(within(connector).getByText(MY_START.connector.pending)).toBeTruthy()
    cleanup()
    mine({ setup: setup({ connector: 'done' }), mcpUrl: MCP })
    const done = section(MY_START.connector.title)
    expect(within(done).getByText(MCP)).toBeTruthy()
    expect(within(done).getByText(MY_START.connector.done)).toBeTruthy()
  })

  it('resumes a skipped step, even once the home has no guide', async () => {
    mine({
      setup: setup({ taste: 'done', import: 'skipped', connector: 'done' }),
      mcpUrl: MCP,
    })
    const skipped = section(MY_START.skipped.title)
    const resume = within(skipped).getByText(MY_START.resume)
    expect(within(skipped).queryByText(/Meu gosto/)).toBeNull()
    await userEvent.setup().click(resume)
    expect(link(skipped, 'Importar')).toBe('/meu-gosto/importar')
  })

  it('keeps a skipped connector behind its Retomar, not twice', async () => {
    mine({ setup: setup({ connector: 'skipped' }), mcpUrl: MCP })
    expect(
      screen.queryByRole('region', { name: MY_START.connector.title }),
    ).toBeNull()
    const skipped = section(MY_START.skipped.title)
    await userEvent.setup().click(within(skipped).getByText(MY_START.resume))
    expect(within(skipped).getByText(MCP)).toBeTruthy()
  })

  it('has neither on another Pessoa’s page, nor what the server cannot say', () => {
    render(
      <PersonScreen
        slug="iara"
        page={IARA}
        start={{ setup: setup({ import: 'skipped' }), mcpUrl: MCP }}
      />,
    )
    expect(
      screen.queryByRole('region', { name: MY_START.connector.title }),
    ).toBeNull()
    expect(
      screen.queryByRole('region', { name: MY_START.skipped.title }),
    ).toBeNull()
    cleanup()
    mine({ setup: null, mcpUrl: null })
    expect(
      screen.queryByRole('region', { name: MY_START.connector.title }),
    ).toBeNull()
    expect(
      screen.queryByRole('region', { name: MY_START.skipped.title }),
    ).toBeNull()
  })
})

describe('the Acesso section', () => {
  const ADMIN = { person: 'bruno', name: 'Bruno', admin: true }

  it('is not there for a Dono who is not admin', () => {
    show()
    expect(screen.queryByRole('region', { name: PERSON.access.title })).toBe(
      null,
    )
  })

  it('gives an admin a Google e-mail field and "Dar acesso"', async () => {
    show({ ...IARA, viewer: ADMIN, access: { email: null } })
    const region = section(PERSON.access.title)
    expect(within(region).getByText(PERSON.access.none)).toBeTruthy()
    const form = within(region).getByRole('form', {
      name: PERSON.access.grant,
    })
    const user = userEvent.setup()
    await user.type(
      within(form).getByLabelText(PERSON.access.email),
      'iara@example.org',
    )
    expect(posted(form)).toEqual({ kind: 'grant', email: 'iara@example.org' })
    const link = within(
      screen.getByRole('navigation', { name: PERSON.contents }),
    ).getByRole('link', { name: PERSON.access.title })
    expect(link.getAttribute('href')).toBe('#acesso')
  })

  it('shows a Dono her e-mail and "Tirar acesso"', () => {
    show({
      ...IARA,
      owner: true,
      viewer: ADMIN,
      access: { email: 'iara@example.org' },
    })
    const region = section(PERSON.access.title)
    expect(
      within(region).getByText(PERSON.access.owner('iara@example.org')),
    ).toBeTruthy()
    const form = within(region).getByRole('form', {
      name: PERSON.access.revoke,
    })
    expect(posted(form)).toEqual({ kind: 'revoke' })
  })

  it("has no Acesso on the admin's own page", () => {
    show({
      ...IARA,
      person: 'bruno',
      name: 'Bruno',
      owner: true,
      viewer: ADMIN,
      access: { email: 'bruno@example.org' },
    })
    expect(
      screen.queryByRole('region', { name: PERSON.access.title }),
    ).toBeNull()
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

describe('Meu gosto in the second person', () => {
  const OWN: PersonPage = {
    ...IARA,
    person: 'bruno',
    name: 'Bruno',
    aliases: ['eu'],
    owner: true,
    vetoes: [],
    openQuestions: [],
    adjustments: [],
    seen: [
      {
        film: 'tt9000401',
        title: 'Fronteira',
        rating: 4,
        date: '2026-11-20',
        source: RATING_SCREEN_SOURCE,
        factId: 'vistos:9',
      },
    ],
  }

  it('opens with her taste in one look and one next step', () => {
    render(<PersonScreen slug="bruno" page={OWN} />)
    const glance = section(PERSON.glance.title)
    expect(screen.getAllByRole('region')[0]).toBe(glance)
    expect(glance.textContent).toContain('1 Nota · faltam 9 para 10')
    expect(
      within(glance).getByRole('link', { name: PERSON.glance.steps.rate }),
    ).toHaveProperty('pathname', '/meu-gosto/notas')
    expect(screen.getByText(PERSON.ownName('Bruno', ['eu']))).toBeTruthy()
  })

  it('folds the empty fichas into one line and the normal Ajustes into one row', () => {
    render(<PersonScreen slug="bruno" page={OWN} />)
    expect(
      screen.getByText(
        PERSON.empties([
          PERSON.questions.title,
          PERSON.vetoes.title,
          PERSON.seen.title,
        ]),
      ),
    ).toBeTruthy()
    expect(screen.getByText(PERSON.adjustments.allNormal)).toBeTruthy()
    expect(
      within(section(PERSON.adjustments.title)).getByText(
        PERSON.adjustments.ownLead,
      ),
    ).toBeTruthy()
  })

  it('leaves her site Notas out of Já vistos', () => {
    render(<PersonScreen slug="bruno" page={OWN} />)
    const seen = section(PERSON.seen.title)
    expect(within(seen).getByText(PERSON.seen.empty)).toBeTruthy()
  })
})
