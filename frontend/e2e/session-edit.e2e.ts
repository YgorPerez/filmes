// Editing an open Session's request and Restrições (#372), over the build
// and this file's own fixture copy: the Dono opens the form from the ⋯
// menu, finds it filled with the current version, changes it and saves;
// the Session is redone in place, a new version with the films that still
// pass. A told Session and a Dono who was not there get no form.
// `E2E_SCREENSHOTS=<folder>` saves a capture of each screen.

import { listSessions, recommendSession, recordFeedback } from '@filmes/engine'
import type { Page } from '@playwright/test'
import { engineRun, expect, loginAs, loginAsBruno, snap, test } from './support'

/** Opens a Session as Bruno, through the engine; gives its id. */
const openAsBruno = async (request: Parameters<typeof recommendSession>[0]) =>
  (
    await engineRun((engine) =>
      engine.run(recommendSession(request), { owner: 'bruno' }),
    )
  ).session.id

const sessionFile = async (id: string) =>
  (await engineRun((engine) => engine.run(listSessions))).sessions.find(
    (s) => s.id === id,
  )

const openMenu = (page: Page) => page.getByLabel('Mais ações da Sessão').click()

test('the Dono edits the request from the Session page and the Session is redone', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'one Session per project')
  const id = await openAsBruno({
    attendees: ['bruno', 'iara'],
    count: 3,
    request: 'algo bom',
    maxDuration: 150,
  })
  await loginAsBruno(page)
  await page.goto(`/sessoes/${id}`)
  await openMenu(page)
  await page.getByRole('link', { name: 'Editar pedido' }).click()

  await expect(page).toHaveURL(new RegExp(`/sessoes/${id}/pedido$`))
  const form = page.getByRole('form', { name: 'Editar o pedido da Sessão' })
  await expect(form.getByLabel('O pedido', { exact: false })).toHaveValue(
    'algo bom',
  )
  await expect(form.getByLabel('Duração máxima', { exact: false })).toHaveValue(
    '150',
  )
  await form.getByLabel('O pedido', { exact: false }).fill('algo curto')
  await form.getByLabel('Duração máxima', { exact: false }).fill('120')
  await form.getByText('Mais opções', { exact: true }).click()
  await form.getByRole('checkbox', { name: 'Nada lento' }).check()
  await snap(page, info, 'sessao-editar-pedido')
  await form.getByRole('button', { name: 'Salvar e refazer' }).click()

  await expect(page).toHaveURL(
    new RegExp(`/sessoes/${id}\\?feito=regerada(&nota=[^&]+)?$`),
  )
  await expect(page.getByRole('article').first()).toBeVisible()
  await snap(page, info, 'sessao-editada')
  expect(await sessionFile(id)).toMatchObject({
    open: true,
    version: 2,
    attendees: ['bruno', 'iara'],
    request: 'algo curto',
    constraints: ['até 2h', 'nada lento'],
  })
})

test('a told Session and a Dono who was not there get no form', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'one Session per project')
  const told = await openAsBruno({ attendees: ['bruno', 'quim'], count: 3 })
  await engineRun((engine) =>
    engine.run(recordFeedback({ session: told, film: null }), {
      owner: 'bruno',
    }),
  )
  const other = await openAsBruno({ attendees: ['bruno', 'iara'], count: 3 })

  await loginAsBruno(page)
  await page.goto(`/sessoes/${told}/pedido`)
  await expect(page.getByText('Esta Sessão já foi contada')).toBeVisible()
  await expect(page.getByRole('form')).toHaveCount(0)

  await page.context().clearCookies()
  await loginAs(page, 'vera@example.org')
  await page.goto(`/sessoes/${other}/pedido`)
  await expect(
    page.getByText('Só quem estava na Sessão edita o pedido dela.'),
  ).toBeVisible()
  await expect(page.getByRole('form')).toHaveCount(0)
})
