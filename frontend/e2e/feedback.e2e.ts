// The Feedback screen over the build, on the fixture copy (never the real
// filmes-dados). The Sessions are opened with the engine, as the Sessions
// screen (W1) will. The two projects run at once on the same copy, so each
// one has its own group: the desktop Bruno, Rosa and Quim, the mobile Bruno,
// Teo and Iara (the satisfaction only counts Sessions shared with today's
// Presentes). `E2E_SCREENSHOTS=<folder>` saves a capture of each screen.

import { openSessions, recommendSession } from '@filmes/engine'
import { type Page } from '@playwright/test'
import { engineRun, expect, loginAsBruno, snap, tab, test } from './support'

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

/** One Presente's reaction, by her name (#272). */
const reactionOf = (page: Page, name: string) =>
  page.getByRole('group', { name: new RegExp(`^${name}\\b`) })

/** Her Nota of 1 to 10; for a Presente who is not the Dono, under "ou dar
 * nota". */
async function rate(page: Page, name: string, n: string) {
  const reaction = reactionOf(page, name)
  const give = reaction.getByText('ou dar nota de 1 a 10')
  if (await give.count()) await give.click()
  await reaction
    .getByRole('radiogroup')
    .getByRole('radio', { name: n, exact: true })
    .check()
}

/** Her comment, under "comentar". */
async function commentOn(page: Page, name: string, text: string) {
  await reactionOf(page, name).getByText('comentar', { exact: true }).click()
  await page.getByLabel(`Comentário: ${name}`).fill(text)
}

test('the Dono closes a Session and the next one shows the satisfaction', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'one group per project')
  const first = await openSession(['dono', 'rosa', 'quim'])
  await loginAsBruno(page)
  await snap(page, info, 'inicio')

  // Sessões leads to its Feedback (the home shows only the latest, and the
  // other project opens its own at the same time).
  await tab(page, 'Sessões').click()
  await page.getByRole('link', { name: 'Para contar' }).click()
  await expect(page).toHaveURL(/\/sessoes\?filtro=para-contar$/)
  await page
    .getByRole('listitem')
    .filter({
      has: page.locator(`a[href="/sessoes/${first}"]`),
    })
    .getByRole('link', { name: 'Contar como foi' })
    .click()
  await expect(page).toHaveURL(new RegExp(`/sessoes/${first}/contar$`))
  await expect(satisfaction(page)).toContainText(
    'Ninguém deste grupo está atrás dos outros',
  )
  await snap(page, info, 'feedback-form')

  // Bruno and Quim loved the first film; Rosa did not.
  await page.locator('input[name="filme"]').first().check()
  await rate(page, 'Bruno', '10')
  await rate(page, 'Quim', '9')
  await commentOn(page, 'Quim', 'quero ver de novo')
  await rate(page, 'Rosa', '2')
  await snap(page, info, 'feedback-preenchido')
  await page.getByRole('button', { name: 'Gravar e fechar a Sessão' }).click()

  await expect(page).toHaveURL(new RegExp(`/sessoes/${first}\\?feito=contada$`))
  // The told Session opens with the tape given back (#272).
  await expect(
    page.getByRole('region', { name: 'Fita devolvida' }),
  ).toContainText('Bruno: deu 10 de 10')
  await snap(page, info, 'feedback-gravado')
  expect(await stillOpen(first)).toBe(false)
  await page.goto('/feedback')
  await expect(page).toHaveURL(/\/sessoes\?filtro=para-contar$/)
  await expect(page.locator(`a[href="/sessoes/${first}"]`)).toHaveCount(0)
  await page.getByRole('link', { name: 'Todas' }).click()
  await expect(page.locator(`a[href="/sessoes/${first}"]`)).toBeVisible()

  // The same group again: Rosa left the first Session the least satisfied.
  const next = await openSession(['dono', 'rosa', 'quim'])
  await page.goto(`/sessoes/${next}/contar`)
  await expect(satisfaction(page)).toContainText('Rosa')
  await expect(satisfaction(page)).toContainText(
    /satisfação de Rosa nas últimas Sessões: 11%, e a mais alta do grupo, 100%; na de 2026-11-20 \(.+\), deu 1/,
  )
  await snap(page, info, 'feedback-satisfacao')
})

test('a relayed Relato, a film by its title, and a refusal in place', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'one group per project')
  const id = await openSession(['dono', 'teo', 'iara'])
  await loginAsBruno(page)
  // The old address still reaches the form.
  await page.goto(`/feedback/${id}`)
  await expect(page).toHaveURL(new RegExp(`/sessoes/${id}/contar$`))

  // "Usar" takes the film in place: its id goes in the field.
  const field = page.getByLabel('Título ou ID do IMDb', { exact: false })
  await page.getByLabel('Outro filme').check()
  await field.fill('fronteira (2012)')
  await page.getByRole('button', { name: 'Usar Fronteira II (2012)' }).click()
  await expect(field).toHaveValue('tt9001903')
  await expect(page).toHaveURL(new RegExp(`/sessoes/${id}/contar$`))

  // A comment with no reaction is refused on top, in place, and the
  // Session stays open.
  await commentOn(page, 'Teo', 'dormiu')
  await page.getByRole('button', { name: 'Gravar e fechar a Sessão' }).click()
  await expect(page.getByRole('alert')).toContainText(
    'O comentário vai junto da Nota ou do Relato',
  )
  await expect(page).toHaveURL(new RegExp(`/sessoes/${id}/contar$`))
  await expect(page.getByLabel('Comentário: Teo')).toHaveValue('dormiu')
  await expect(field).toHaveValue('tt9001903')
  await snap(page, info, 'feedback-recusa')
  expect(await stillOpen(id)).toBe(true)

  // Typed over, the field is a title again.
  await page.getByLabel('Comentário: Teo').fill('')
  await field.fill('Café Amargo')
  await rate(page, 'Bruno', '8')
  await reactionOf(page, 'Iara')
    .getByRole('radio', { name: 'gostou', exact: true })
    .check()
  await commentOn(page, 'Iara', 'riu muito')
  await page.getByRole('button', { name: 'Gravar e fechar a Sessão' }).click()
  await expect(page).toHaveURL(new RegExp(`/sessoes/${id}\\?feito=contada$`))
  expect(await stillOpen(id)).toBe(false)

  // The form of a told Session says so, and leads to it (#272).
  await page.goto(`/sessoes/${id}/contar`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Esta Sessão já foi contada',
  )
  await expect(page.getByRole('link', { name: 'Ver a Sessão' })).toBeVisible()
})

test.describe('without the JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('the plain post comes back with the refusal', async ({ page }) => {
    const id = await openSession(['dono'])
    await loginAsBruno(page)
    await page.goto(`/sessoes/${id}/contar`)

    await page.getByRole('button', { name: 'Gravar e fechar a Sessão' }).click()
    await expect(page).toHaveURL(
      new RegExp(`/sessoes/${id}/contar\\?erro=filme$`),
    )
    await expect(page.getByRole('alert')).toContainText(
      'Escolha o filme que vocês viram',
    )
    expect(await stillOpen(id)).toBe(true)
  })
})
