// The Pessoas screens over the build, on the fixture copy (never the real
// filmes-dados). The two projects run at once on the same copy, so each one
// writes to its own Pessoas: the desktop to Rosa and Quim, the mobile to Teo
// and Iara. `E2E_SCREENSHOTS=<folder>` saves a capture of each screen there.

import { personSkip, personView } from '@filmes/engine'
import { expect, test, type Page } from '@playwright/test'
import { engineRun, loginAsBruno, notice, section, snap } from './support'

/** What the engine reads in her file now, after the app wrote it. */
const engineView = (person: string) =>
  engineRun((engine) => engine.run(personView(person)))

/** Opens the section's "Acrescentar …" and gives its form. */
async function addForm(page: Page, region: string, summary: string) {
  const area = section(page, region)
  await area.getByText(summary, { exact: true }).click()
  return area.getByRole('form', { name: summary })
}

test('the Dono reads and changes a Pessoa’s taste', async ({ page }, info) => {
  const slug = info.project.name === 'desktop' ? 'rosa' : 'teo'
  const name = slug === 'rosa' ? 'Rosa' : 'Teo'
  await loginAsBruno(page)

  await page.getByRole('link', { name: 'Pessoas' }).click()
  await expect(page).toHaveURL(/\/pessoas$/)
  await expect(page.getByRole('heading', { name: 'Pessoas' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Bruno.*Dono/ })).toBeVisible()
  await snap(page, info, 'pessoas')

  await page.getByRole('link', { name: new RegExp(name) }).click()
  await expect(page).toHaveURL(new RegExp(`/pessoas/${slug}$`))
  await expect(page.getByRole('heading', { name })).toBeVisible()
  await snap(page, info, 'pessoa-vazia')

  // A Veto by id, and one to a tag group.
  let form = await addForm(page, 'Vetos', 'Acrescentar Veto')
  await form.getByLabel('O Veto, como foi dito').fill('nunca vê terror')
  await form.getByLabel(/^Alvo/).fill('Q9001801')
  await form.getByRole('button', { name: 'Gravar' }).click()
  await expect(notice(page)).toHaveText('Gravado no arquivo dela.')
  await expect(section(page, 'Vetos')).toContainText('Terror (Q9001801)')

  form = await addForm(page, 'Vetos', 'Acrescentar Veto')
  await form.getByLabel('O Veto, como foi dito').fill('nada lento')
  await form.getByLabel('Grupo de tags').selectOption({ label: 'lento' })
  await form.getByRole('button', { name: 'Gravar' }).click()
  await expect(section(page, 'Vetos')).toContainText('(slow)')

  // An id the Catalog does not have.
  form = await addForm(page, 'Vetos', 'Acrescentar Veto')
  await form.getByLabel('O Veto, como foi dito').fill('nunca')
  await form.getByLabel(/^Alvo/).fill('Q1')
  await form.getByRole('button', { name: 'Gravar' }).click()
  await expect(page.getByRole('alert')).toContainText('não está no Catálogo')
  await snap(page, info, 'pessoa-erro')

  // The cast Ajuste down to nothing.
  const cast = page.getByLabel(/^Ajuste de elenco/)
  await cast.selectOption({ label: 'nada' })
  await cast
    .locator('xpath=ancestor::form')
    .getByRole('button', { name: 'Mudar' })
    .click()
  await expect(notice(page)).toHaveText('Ajuste gravado.')
  await expect(page.getByLabel(/^Ajuste de elenco/)).toHaveValue('none')

  // A Declarado about an entity, a Relato, a Já visto with a Nota.
  form = await addForm(page, 'Declarados', 'Acrescentar Declarado')
  await form.getByLabel('O que foi dito').fill('adoro os filmes dela')
  await form.getByLabel(/^Alvo/).fill('Q9000018')
  await form.getByLabel('Reação ao alvo').selectOption({ label: 'ama' })
  await form.getByRole('button', { name: 'Gravar' }).click()
  await expect(section(page, 'Declarados')).toContainText(
    'ama Sofia Rangel (Q9000018) · específico',
  )

  form = await addForm(page, 'Relatos', 'Acrescentar Relato')
  await form.getByLabel('O que foi dito').fill('odeia filme lento')
  await form.getByRole('button', { name: 'Gravar' }).click()
  await expect(section(page, 'Relatos')).toContainText('odeia filme lento')

  form = await addForm(page, 'Já vistos', 'Acrescentar Já visto')
  await form.getByLabel(/^Filme/).fill('tt9000602')
  await form.getByLabel(/^Nota/).selectOption('4')
  await form.getByRole('button', { name: 'Gravar' }).click()
  await expect(section(page, 'Já vistos')).toContainText('Casa Cheia')
  await expect(section(page, 'Já vistos')).toContainText('nota 4')
  await snap(page, info, 'pessoa-com-gosto')

  // Out again.
  await page.getByRole('button', { name: 'Tirar nunca vê terror' }).click()
  await expect(notice(page)).toHaveText('Tirado do arquivo dela.')
  await expect(section(page, 'Vetos')).not.toContainText('Q9001801')

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
  expect(view.seen.map((s) => [s.film, s.rating])).toEqual([['tt9000602', 4]])
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
    await questions.getByText('Responder', { exact: true }).click()
    const answer = questions.getByRole('form', { name: /^Responder/ })
    await answer.getByLabel('A resposta dela').fill('adora')
    await answer.getByLabel(/^Reação ao alvo/).selectOption({ label: 'ama' })
    await answer.getByRole('button', { name: 'Gravar' }).click()
    await expect(notice(page)).toContainText('Resposta gravada como Declarado')
    await expect(questions).toContainText('Nenhuma pergunta aberta.')
    await expect(section(page, 'Declarados')).toContainText(
      'ama Helena Prado (Q9000001)',
    )
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

test('a name no Pessoa has says so', async ({ page }) => {
  await loginAsBruno(page)
  await page.goto('/pessoas/ninguem')
  await expect(page.getByRole('alert')).toContainText(
    'Nenhuma Pessoa com esse nome',
  )
})
