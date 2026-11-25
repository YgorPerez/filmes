// The Sessions screens over the build, on the fixture copy (never the real
// filmes-dados): the Dono asks for a Session with the form, sees its
// Recomendação, finds it among the open Sessions with the way to its
// Feedback. The two projects share the copy, so each opens Sessions for its
// own group (desktop: Bruno and Iara; mobile: Bruno and Quim) and reads the
// id from the page it lands on. `E2E_SCREENSHOTS=<folder>` saves a capture
// of each screen.

import { listSessions } from '@filmes/engine'
import { expect, test, type Page } from '@playwright/test'
import { engineRun, loginAsBruno, section, snap } from './support'

const ask = (page: Page) =>
  page.getByRole('button', { name: 'Recomendar' }).click()

/** The id of the Session whose page is open. */
const openedId = (page: Page) =>
  decodeURIComponent(new URL(page.url()).pathname.split('/').at(-1) ?? '')

const sessionFile = async (id: string) =>
  (await engineRun((engine) => engine.run(listSessions))).sessions.find(
    (s) => s.id === id,
  )

test('the Dono opens a Session with Restrições and finds it in the list', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'one group per project')
  await loginAsBruno(page)
  await snap(page, info, 'inicio')
  await page.getByRole('link', { name: 'Sessões' }).click()
  await expect(page).toHaveURL(/\/sessoes$/)
  await snap(page, info, 'sessoes-lista')

  await page.getByRole('link', { name: 'Nova Sessão' }).click()
  await expect(page).toHaveURL(/\/sessoes\/nova$/)
  await expect(page.getByRole('checkbox', { name: /Bruno/ })).toBeChecked()
  await page.getByRole('checkbox', { name: 'Iara' }).check()
  await page.getByRole('checkbox', { name: 'leve' }).check()
  await page.getByLabel('Quantos filmes', { exact: false }).fill('3')
  await page.getByLabel('Em uma frase', { exact: false }).fill('eu e a Iara')
  await page.getByLabel('Duração máxima', { exact: false }).fill('130')
  await page.getByLabel('Criança').selectOption('7')
  await page.getByRole('checkbox', { name: 'Nada lento' }).check()
  await snap(page, info, 'sessoes-nova')
  await ask(page)

  await expect(page).toHaveURL(/\/sessoes\/2026-11-20-iara[^/]*\?feito=aberta$/)
  const id = openedId(page)
  await expect(page.getByRole('status')).toContainText('Sessão aberta')
  await expect(
    page.getByRole('img', { name: /até 2h10 · .*com criança de 7 anos/ }),
  ).toBeVisible()
  const films = page.getByRole('article')
  await expect(films.first()).toBeVisible()
  expect(await films.count()).toBeLessThanOrEqual(3)
  await snap(page, info, 'sessoes-aberta')

  // The engine wrote what the form asked.
  const written = await sessionFile(id)
  expect(written).toMatchObject({
    open: true,
    attendees: ['bruno', 'iara'],
    request: 'eu e a Iara',
    moods: ['leve'],
    constraints: ['até 2h10', 'com criança de 7 anos', 'nada lento'],
  })

  await page.getByRole('link', { name: 'Voltar' }).click()
  const row = section(page, 'Abertas')
    .getByRole('listitem')
    .filter({
      has: page.locator(`a[href="/sessoes/${id}"]`),
    })
  await expect(row).toContainText('eu e a Iara')
  await expect(
    row.getByRole('link', { name: `Contar como foi a Sessão ${id}` }),
  ).toHaveAttribute('href', `/feedback/${id}`)
  await snap(page, info, 'sessoes-lista-com-sessao')
})

test('the form says why it refused, and “o gosto de uma Pessoa” orders', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'one group per project')
  await loginAsBruno(page)
  await page.goto('/sessoes/nova')

  // No Presente: the page refuses before the engine.
  await page.getByRole('checkbox', { name: /Bruno/ }).uncheck()
  await ask(page)
  await expect(page).toHaveURL(/\/sessoes\/nova\?erro=presentes$/)
  await expect(page.getByRole('alert')).toContainText(
    'Marque pelo menos um Presente',
  )
  await snap(page, info, 'sessoes-recusa')

  // A film the Catálogo does not have: the engine refuses.
  await page.getByLabel('Parecido com', { exact: false }).fill('tt0000001')
  await ask(page)
  await expect(page).toHaveURL(/\/sessoes\/nova\?erro=parecido$/)

  await page.getByRole('checkbox', { name: 'Quim' }).check()
  await page.getByRole('radio', { name: 'O gosto de uma Pessoa' }).check()
  await page.getByRole('combobox', { name: /^De quem/ }).selectOption('quim')
  await ask(page)
  await expect(page).toHaveURL(/\/sessoes\/2026-11-20-quim[^/]*\?feito=aberta$/)
  const id = openedId(page)
  expect((await sessionFile(id))?.attendees).toEqual(['bruno', 'quim'])
  await snap(page, info, 'sessoes-aberta')
})
