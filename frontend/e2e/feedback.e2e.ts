// The Feedback screen over the build, on the fixture copy (never the real
// filmes-dados). The Sessions are opened with the engine, as the Sessions
// screen (W1) will. The two projects run at once on the same copy, so each
// one has its own group: the desktop Bruno, Rosa and Quim, the mobile Bruno,
// Teo and Iara (the satisfaction only counts Sessions shared with today's
// Presentes). `E2E_SCREENSHOTS=<folder>` saves a capture of each screen.

import { openSessions, recommendSession } from '@filmes/engine'
import { expect, test, type Page } from '@playwright/test'
import { loginAsBruno, engineRun, snap } from './support'

/** Opens a Session for `attendees`, as Bruno; gives its id. */
const openSession = async (attendees: string[]) =>
  (
    await engineRun((engine) =>
      engine.run(recommendSession({ attendees, count: 3 }), {
        owner: 'bruno',
      }),
    )
  ).session.id

const stillOpen = async (id: string) =>
  (await engineRun((engine) => engine.run(openSessions))).sessions.some(
    (s) => s.id === id,
  )

const satisfaction = (page: Page) =>
  page.getByRole('region', { name: 'Satisfação' })

test('the Dono closes a Session and the next one shows the satisfaction', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'one group per project')
  const first = await openSession(['dono', 'rosa', 'quim'])
  await loginAsBruno(page)
  await snap(page, info, 'inicio')

  await page.getByRole('link', { name: 'Feedback', exact: true }).click()
  await expect(page).toHaveURL(/\/feedback$/)
  await snap(page, info, 'feedback-lista')
  await page.locator(`a[href="/feedback/${first}"]`).click()
  await expect(page).toHaveURL(new RegExp(`/feedback/${first}$`))
  await expect(satisfaction(page)).toContainText(
    'Ninguém deste grupo está atrás dos outros',
  )
  await snap(page, info, 'feedback-form')

  // Bruno and Quim loved the first film; Rosa did not.
  await page.locator('input[name="filme"]').first().check()
  await page.getByLabel('Reação: Bruno').selectOption('nota:5')
  await page.getByLabel('Reação: Quim').selectOption('nota:4,5')
  await page.getByLabel('Comentário: Quim').fill('quero ver de novo')
  await page.getByLabel('Reação: Rosa').selectOption('nota:1')
  await snap(page, info, 'feedback-preenchido')
  await page.getByRole('button', { name: 'Gravar e fechar a Sessão' }).click()

  await expect(page).toHaveURL(new RegExp(`/feedback\\?feito=${first}$`))
  await expect(page.getByRole('status')).toContainText(
    `a Sessão ${first} fechou`,
  )
  await snap(page, info, 'feedback-gravado')
  expect(await stillOpen(first)).toBe(false)

  // The same group again: Rosa left the first Session the least satisfied.
  const next = await openSession(['dono', 'rosa', 'quim'])
  await page.goto(`/feedback/${next}`)
  await expect(satisfaction(page)).toContainText('Rosa')
  await expect(satisfaction(page)).toContainText(
    /satisfação de Rosa nas últimas Sessões: 11%, e a mais alta do grupo, 100%; na de 2026-11-20 \(.+\), deu 1/,
  )
  await snap(page, info, 'feedback-satisfacao')
})

test('a relayed Relato, a film by its title, and a refusal', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'one group per project')
  const id = await openSession(['dono', 'teo', 'iara'])
  await loginAsBruno(page)
  await page.goto(`/feedback/${id}`)

  // A comment with no reaction is refused, and the Session stays open.
  await page.getByLabel('Título ou ID do IMDb', { exact: false }).fill('x')
  await page.getByLabel('Comentário: Teo').fill('dormiu')
  await page.getByRole('button', { name: 'Gravar e fechar a Sessão' }).click()
  await expect(page).toHaveURL(new RegExp(`/feedback/${id}\\?erro=comentario$`))
  await expect(page.getByRole('alert')).toContainText(
    'O comentário vai junto da Nota ou do Relato',
  )
  await snap(page, info, 'feedback-recusa')
  expect(await stillOpen(id)).toBe(true)

  // Not Pequenos Milagres: the Feedback makes the film a Já visto of each
  // Presente, and that one is Bruno's Aposta in `billboard.e2e.ts`.
  await page.getByLabel('Outro filme').check()
  await page
    .getByLabel('Título ou ID do IMDb', { exact: false })
    .fill('Café Amargo')
  await page.getByLabel('Reação: Bruno').selectOption('nota:4')
  await page.getByLabel('Reação: Iara').selectOption('relato:gostou')
  await page.getByLabel('Comentário: Iara').fill('riu muito')
  await page.getByRole('button', { name: 'Gravar e fechar a Sessão' }).click()
  await expect(page).toHaveURL(new RegExp(`/feedback\\?feito=${id}$`))
  expect(await stillOpen(id)).toBe(false)

  // The form of a closed Session says so.
  await page.goto(`/feedback/${id}`)
  await expect(page.getByRole('alert')).toContainText('ela já tem Feedback')
})
