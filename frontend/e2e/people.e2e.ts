// The Pessoas screens over the build, on the fixture copy (never the real
// filmes-dados). The two projects run at once on the same copy, so each one
// writes to its own Pessoas: the desktop to Rosa and Quim, the mobile to Teo
// and Iara. Creating a Pessoa (#137) makes one of each project's own (Luana
// on desktop, Nina on mobile); only the desktop creates a Dono, who then
// logs in through the stand-in Google. `E2E_SCREENSHOTS=<folder>` saves a
// capture of each screen there.

import { personSkip, personView } from '@filmes/engine'
import { type Page, type TestInfo } from '@playwright/test'
import {
  tab,
  engineRun,
  expect,
  loginAs,
  loginAsBruno,
  notice,
  section,
  snap,
  test,
} from './support'

/** What the engine reads in her file now, after the app wrote it. */
const engineView = (person: string) =>
  engineRun((engine) => engine.run(personView(person)))

/** Marks the page loaded now: `expectSamePage` finds the mark while no
 * form has loaded a new page since. */
const markPage = (page: Page) =>
  page.evaluate(() => {
    document.documentElement.dataset.sameLoad = 'sim'
  })

const expectSamePage = (page: Page) =>
  expect(page.locator('html')).toHaveAttribute('data-same-load', 'sim')

/** Opens the section's "Acrescentar …" and gives its form. */
async function addForm(page: Page, region: string, summary: string) {
  const area = section(page, region)
  await area.getByText(summary, { exact: true }).click()
  return area.getByRole('form', { name: summary })
}

/** The target's field (#273): a search by name, then "Usar" on the
 * result that is `pick`. */
async function target(
  form: ReturnType<Page['getByRole']>,
  label: RegExp,
  query: string,
  pick: RegExp,
) {
  await form.getByRole('searchbox', { name: label }).fill(query)
  await form.getByRole('button', { name: pick }).first().click()
}

/** Opens "Afinar", where the Ajustes, Declarados and Relatos are. */
const refine = (page: Page) => page.getByText(/^Afinar:/).click()

/** Sends a Veto to an id the Catálogo does not have, which the server
 * refuses, and gives its form. Before the JavaScript, the target's field
 * takes the ID. */
async function vetoOutsideCatalog(page: Page) {
  const form = await addForm(page, 'Vetos', 'Acrescentar Veto')
  await form.getByLabel('O Veto, como foi dito').fill('nunca')
  await form.getByLabel(/^Diga o quê/).fill('Q1')
  await form.getByRole('button', { name: 'Gravar' }).click()
  return form
}

/** Her page, open, under her name. */
async function expectPersonPage(page: Page, url: RegExp, name: string) {
  await expect(page).toHaveURL(url)
  await expect(page.getByRole('heading', { name })).toBeVisible()
}

async function addTwoVetoes(page: Page) {
  // A Veto to a genre found by its name (#273), and one to a tag group.
  let form = await addForm(page, 'Vetos', 'Acrescentar Veto')
  await form.getByLabel('O Veto, como foi dito').fill('nunca vê terror')
  await target(form, /^Diga o quê/, 'terror', /^Usar Terror/)
  await form.getByRole('button', { name: 'Gravar' }).click()
  // Said inside the ficha that posted it, under her name.
  await expect(section(page, 'Vetos').getByRole('status')).toHaveText(
    'Veto gravado.',
  )
  await expect(section(page, 'Vetos')).toContainText('“nunca vê terror”')

  form = await addForm(page, 'Vetos', 'Acrescentar Veto')
  await form.getByLabel('O Veto, como foi dito').fill('nada lento')
  await form.getByText('lento', { exact: true }).click()
  await form.getByRole('button', { name: 'Gravar' }).click()
  await expect(section(page, 'Vetos')).toContainText('“nada lento”')
}

async function castAdjustmentToNothing(page: Page) {
  // The cast Ajuste down to nothing: a tap saves it, "gravado" beside it.
  await refine(page)
  const cast = () => page.getByRole('group', { name: /^Ajuste de elenco/ })
  await cast().getByText('nada', { exact: true }).click()
  await expect(cast().getByRole('status')).toHaveText('Ajuste gravado')
  await expect(cast().getByRole('radio', { name: 'nada' })).toBeChecked()
}

async function addStatedReportAndSeen(page: Page, info: TestInfo) {
  // A Declarado about an entity, a Relato, a Já visto with a Nota.
  let form = await addForm(page, 'Declarados', 'Acrescentar Declarado')
  await form.getByLabel('O que foi dito').fill('adoro os filmes dela')
  await target(form, /^Sobre o quê/, 'sofia rangel', /^Usar Sofia Rangel/)
  await form.getByLabel('Reação').selectOption({ label: 'ama' })
  await form.getByRole('button', { name: 'Gravar' }).click()
  // The target in words, its name a link; "específico" is gone (#274).
  const stated = section(page, 'Declarados')
  await expect(stated).toContainText('ama Sofia Rangel')
  await expect(stated).not.toContainText('específico')

  form = await addForm(page, 'Relatos', 'Acrescentar Relato')
  await form.getByLabel('O que foi dito').fill('odeia filme lento')
  await form.getByRole('button', { name: 'Gravar' }).click()
  await expect(section(page, 'Relatos')).toContainText('odeia filme lento')

  form = await addForm(page, 'Já vistos', 'Acrescentar Já visto')
  await target(form, /^Filme/, 'casa cheia', /^Usar Casa Cheia/)
  await form
    .getByRole('group', { name: 'Nota' })
    .getByRole('radio', { name: '8', exact: true })
    .check()
  await form.getByRole('button', { name: 'Gravar' }).click()
  await expect(section(page, 'Já vistos')).toContainText('Casa Cheia')
  await expect(section(page, 'Já vistos')).toContainText('nota 8')
  await snap(page, info, 'pessoa-com-gosto')
}

async function editSeen(page: Page, info: TestInfo) {
  // Editar in place (#330): the Nota changes, the item says it was edited.
  const seen = section(page, 'Já vistos')
  await seen.getByRole('button', { name: 'Editar Casa Cheia' }).click()
  const form = seen.getByRole('form', { name: 'Editar Casa Cheia' })
  await expect(form).toContainText('Editando o Já visto')
  await snap(page, info, 'pessoa-editando')
  await form.getByRole('radio', { name: '9', exact: true }).check()
  await form.getByRole('button', { name: 'Gravar' }).click()
  await expect(seen.getByRole('status')).toHaveText('Editado')
  await expect(seen).toContainText('nota 9')
  await expect(seen).toContainText('editado')
}

async function engineReadsItBack(slug: string) {
  // The engine reads it all back from her file.
  const view = await engineView(slug)
  expect(view.vetoes.map((v) => v.target)).toEqual(['slow'])
  expect(view.adjustments.map((a) => [a.link, a.level])).toEqual([
    ['cast', 'none'],
  ])
  expect(view.stated.map((s) => [s.text, s.reaction, s.target])).toEqual([
    ['adoro os filmes dela', 'love', 'Q9000018'],
  ])
  expect(view.reports.map((r) => r.text)).toEqual(['odeia filme lento'])
  // An 8 on the 1 to 10 scale is the engine's 4 of 5; edited to 9, 4.5.
  expect(view.seen.map((s) => [s.film, s.rating, s.edited])).toEqual([
    ['tt9000602', 4.5, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)],
  ])
}

test('the Dono reads and changes a Pessoa’s taste', async ({ page }, info) => {
  const slug = info.project.name === 'desktop' ? 'rosa' : 'teo'
  const name = slug === 'rosa' ? 'Rosa' : 'Teo'
  await loginAsBruno(page)

  await tab(page, 'Pessoas').click()
  await expect(page).toHaveURL(/\/pessoas$/)
  await expect(page.getByRole('heading', { name: 'Pessoas' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Bruno.*Dono/ })).toBeVisible()
  await snap(page, info, 'pessoas')

  await page.getByRole('link', { name: new RegExp(name) }).click()
  await expectPersonPage(page, new RegExp(`/pessoas/${slug}$`), name)
  await snap(page, info, 'pessoa-vazia')
  // Every form below posts by fetch (#235): the page is never loaded again.
  await markPage(page)

  await addTwoVetoes(page)
  await castAdjustmentToNothing(page)
  await addStatedReportAndSeen(page, info)
  await editSeen(page, info)

  // Out again, after the question (#330).
  await page.getByRole('button', { name: 'Tirar nunca vê terror' }).click()
  await page
    .getByRole('button', { name: 'Tirar nunca vê terror de vez' })
    .click()
  await expect(section(page, 'Vetos').getByRole('status')).toHaveText(
    'Veto tirado.',
  )
  await expect(section(page, 'Vetos')).not.toContainText('nunca vê terror')
  await expectSamePage(page)

  await engineReadsItBack(slug)
})

test('the Dono answers or skips an open question', async ({ page }, info) => {
  await loginAsBruno(page)
  if (info.project.name === 'desktop') {
    await page.goto('/pessoas/quim')
    const questions = section(page, 'Perguntas abertas')
    await expect(questions).toContainText(
      'o Quim curte os filmes da Helena Prado?',
    )
    await snap(page, info, 'pergunta-aberta')
    await questions.getByText('Responder com palavras', { exact: true }).click()
    const answer = questions.getByRole('form', { name: /^Responder/ })
    await answer.getByLabel('A resposta de Quim').fill('adora')
    await answer.getByLabel(/^Reação/).selectOption({ label: 'ama' })
    await answer.getByRole('button', { name: 'Gravar' }).click()
    await expect(notice(page)).toContainText('Resposta gravada como Declarado')
    await expect(questions).toContainText('Nenhuma pergunta aberta.')
    await refine(page)
    await expect(section(page, 'Declarados')).toContainText('ama Helena Prado')
    const view = await engineView('quim')
    expect(view.openQuestions).toEqual([])
    // Only her file's: the Feedback e2e gives Quim a Declarado of its own
    // (`feedback:`), at any moment of this run.
    const fromFile = view.stated.filter((s) =>
      s.factId.startsWith('declarados:'),
    )
    expect(fromFile.map((s) => s.text)).toEqual(['adora'])
    return
  }
  // Iara has none in the fixture: the engine asks her one first.
  await engineRun((engine) =>
    engine.run(
      personSkip({
        person: 'iara',
        text: 'a Iara curte terror?',
        subject: 'Q9001801',
      }),
    ),
  )
  await page.goto('/pessoas/iara')
  const questions = section(page, 'Perguntas abertas')
  await expect(questions).toContainText('pulada 1 vez')
  await questions
    .getByRole('button', { name: 'Pular: a Iara curte terror?' })
    .click()
  await expect(notice(page)).toHaveText(
    'Pulada duas vezes: a pergunta saiu da lista.',
  )
  await expect(questions).toContainText('Nenhuma pergunta aberta.')
  expect((await engineView('iara')).openQuestions).toEqual([])
})

test('a Pessoa’s form needs a Dono and this site', async ({ request }) => {
  const response = await request.post('/pessoas/rosa/acao', {
    form: { acao: 'vetar', texto: 'x', alvo: 'Q9001801' },
    maxRedirects: 0,
  })
  expect(response.status()).toBe(303)
  expect(response.headers()['location']).toBe('/entrar')
})

test('a name no Pessoa has is a 404 that says so', async ({ page }) => {
  await loginAsBruno(page)
  const response = await page.goto('/pessoas/ninguem')
  expect(response?.status()).toBe(404)
  await expect(
    page.getByRole('heading', { level: 1, name: 'Pessoa não encontrada' }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ver as Pessoas' })).toBeVisible()
})

/** Opens "Acrescentar Pessoa" on `/pessoas` and gives its form. */
async function createForm(page: Page) {
  await page.goto('/pessoas')
  await page.getByText('Acrescentar Pessoa', { exact: true }).click()
  return page.getByRole('form', { name: 'Acrescentar Pessoa' })
}

test('the Dono adds a Pessoa, who is a Presente at once', async ({
  page,
}, info) => {
  const [name, slug] =
    info.project.name === 'desktop'
      ? ['Luana Reis', 'luana-reis']
      : ['Nina Costa', 'nina-costa']
  await loginAsBruno(page)

  // A name that is taken comes back refused, in place, with what was
  // typed (#235).
  const form = await createForm(page)
  await markPage(page)
  await snap(page, info, 'pessoas-criar')
  await form.getByLabel('Nome').fill('Iara')
  await form.getByLabel(/^Apelidos/).fill('ia')
  await form.getByRole('button', { name: 'Acrescentar' }).click()
  await expect(page.getByRole('alert')).toContainText('Já existe uma Pessoa')
  await expect(page).toHaveURL(/\/pessoas$/)
  await expect(form.getByLabel('Nome')).toHaveValue('Iara')
  await expect(form.getByLabel(/^Apelidos/)).toHaveValue('ia')
  await snap(page, info, 'pessoas-criar-erro')

  await form.getByLabel('Nome').fill(name)
  await form.getByLabel(/^Apelidos/).fill(name.slice(0, 2))
  await form.getByRole('button', { name: 'Acrescentar' }).click()
  await expectPersonPage(
    page,
    new RegExp(`/pessoas/${slug}\\?feito=criada$`),
    name,
  )
  await expect(notice(page)).toHaveText(
    `Pessoa criada. Conte aqui o gosto de ${name}.`,
  )
  await expectSamePage(page)
  await snap(page, info, 'pessoa-criada')

  await page.goto('/sessoes/nova')
  await expect(page.getByRole('checkbox', { name })).toBeVisible()
})

test('the Dono adds a Dono, who logs in with her e-mail', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'the projects share the copy')
  await loginAsBruno(page)
  const form = await createForm(page)
  await form.getByLabel('Nome').fill('Farias')
  await form.getByLabel(/^É Dono/).check()
  await form.getByLabel(/^E-mail do Google/).fill('Farias@Example.org')
  await form.getByRole('button', { name: 'Acrescentar' }).click()
  await expect(page).toHaveURL(/\/pessoas\/farias\?feito=criada$/)

  await page.context().clearCookies()
  await loginAs(page, 'farias@example.org')
  await expect(
    page.getByRole('button', { name: 'Sua conta: Farias' }),
  ).toBeVisible()
})

test.describe('before the JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('a Pessoa’s form and the create form are plain posts', async ({
    page,
  }) => {
    await loginAsBruno(page)
    await page.goto('/pessoas/iara')
    await vetoOutsideCatalog(page)
    // Back to the Vetos, which say why (#273).
    await expect(page).toHaveURL(/\/pessoas\/iara\?erro=alvo&em=vetos#vetos$/)
    await expect(section(page, 'Vetos').getByRole('alert')).toContainText(
      'não está no Catálogo',
    )

    const create = await createForm(page)
    await create.getByLabel('Nome').fill('Iara')
    await create.getByRole('button', { name: 'Acrescentar' }).click()
    await expect(page).toHaveURL(/\/pessoas\?erro=existe/)
    await expect(
      page.getByRole('form', { name: 'Acrescentar Pessoa' }).getByLabel('Nome'),
    ).toHaveValue('Iara')
  })
})
