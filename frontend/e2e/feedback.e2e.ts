// The Feedback screen over the build, on the fixture copy (never the real
// filmes-dados). The Sessions are opened with the engine, as the Sessions
// screen (W1) will. The two projects run at once on the same copy, so each
// one has its own group: the desktop Bruno, Rosa and Quim, the mobile Bruno,
// Teo and Iara (the Crédito only counts Sessions shared with today's
// Presentes). `E2E_SCREENSHOTS=<folder>` saves a capture of each screen.

import { join } from 'node:path'
import { makeEngine, openSessions, recommendSession } from '@filmes/engine'
import { expect, test, type Page, type TestInfo } from '@playwright/test'

function fixtureEngine() {
  const root = process.env.E2E_ENGINE
  return makeEngine({
    FILMES_CONFIG: `${root}/config`,
    FILMES_DADOS: `${root}/data`,
    FILMES_BANCO: `${root}/filmes.sqlite`,
    FILMES_HOJE: '2026-11-20',
  })
}

/** Opens a Session for `attendees`, as Bruno; gives its id. */
async function openSession(attendees: string[]): Promise<string> {
  const engine = fixtureEngine()
  try {
    const outcome = await engine.run(
      recommendSession({ attendees, count: 3 }),
      { owner: 'bruno' },
    )
    if (outcome.exitCode !== 0) throw new Error(JSON.stringify(outcome.output))
    return outcome.output.session.id
  } finally {
    await engine.dispose()
  }
}

async function stillOpen(id: string): Promise<boolean> {
  const engine = fixtureEngine()
  try {
    const outcome = await engine.run(openSessions)
    if (outcome.exitCode !== 0) throw new Error(JSON.stringify(outcome.output))
    return outcome.output.sessions.some((s) => s.id === id)
  } finally {
    await engine.dispose()
  }
}

async function loginAsBruno(page: Page) {
  await page.goto('/')
  await page.getByRole('link', { name: 'Entrar com Google' }).click()
  await page.getByLabel('E-mail').fill('bruno@example.org')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page).toHaveURL(/\/$/)
}

async function snap(page: Page, info: TestInfo, name: string) {
  const folder = process.env.E2E_SCREENSHOTS
  if (!folder) return
  await page.screenshot({
    path: join(folder, `${info.project.name}-${name}.png`),
    fullPage: true,
  })
}

const credit = (page: Page) => page.getByRole('region', { name: 'Crédito' })

test('the Dono closes a Session and the next one shows the Crédito', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'one group per project')
  const first = await openSession(['dono', 'rosa', 'quim'])
  await loginAsBruno(page)
  await snap(page, info, 'inicio')

  await page.getByRole('link', { name: 'Feedback' }).click()
  await expect(page).toHaveURL(/\/feedback$/)
  await snap(page, info, 'feedback-lista')
  await page.locator(`a[href="/feedback/${first}"]`).click()
  await expect(page).toHaveURL(new RegExp(`/feedback/${first}$`))
  await expect(credit(page)).toContainText('Ninguém deste grupo tem Crédito')
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

  // The same group again: Rosa fell behind in the first Session.
  const next = await openSession(['dono', 'rosa', 'quim'])
  await page.goto(`/feedback/${next}`)
  await expect(credit(page)).toContainText('Rosa')
  await expect(credit(page)).toContainText(
    /na Sessão de 2026-11-20 \(.+\), Rosa deu 1 e a média dos Presentes foi/,
  )
  await snap(page, info, 'feedback-credito')
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

  await page.getByLabel('Outro filme').check()
  await page
    .getByLabel('Título ou ID do IMDb', { exact: false })
    .fill('Pequenos Milagres')
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
