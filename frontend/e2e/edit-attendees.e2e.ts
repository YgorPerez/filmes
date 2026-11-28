import {
  listSessions,
  recommendSession,
  recordedFeedback,
  recordFeedback,
} from '@filmes/engine'
import type { Page } from '@playwright/test'
import { engineRun, expect, loginAsBruno, snap, test } from './support'

test.describe.configure({ mode: 'default' })

const owner = { owner: 'bruno' }

async function openSession() {
  const opened = await engineRun((engine) =>
    engine.run(
      recommendSession({ attendees: ['bruno', 'iara'], count: 3 }),
      owner,
    ),
  )
  return opened.session.id
}

const sessionDetails = async (id: string) =>
  (await engineRun((engine) => engine.run(listSessions))).sessions.find(
    (session) => session.id === id,
  )

async function replaceIaraWithTeo(page: Page) {
  await page.getByLabel('Mais ações da Sessão').click()
  await page.getByRole('link', { name: 'Editar Presentes' }).click()
  await page.getByRole('checkbox', { name: 'Iara' }).uncheck()
  await page.getByRole('checkbox', { name: 'Teo' }).check()
}

test('editing the Presentes of an open Session makes a new version', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'one project writes this fixture')
  const id = await openSession()
  await loginAsBruno(page)
  await page.goto(`/sessoes/${id}`)
  await snap(page, info, 'open-before')
  await replaceIaraWithTeo(page)
  await snap(page, info, 'edit-attendees')
  await page
    .getByRole('button', { name: 'Refazer com estes Presentes' })
    .click()

  await expect(page.getByText('Bruno, Teo', { exact: true })).toBeVisible()
  expect(await sessionDetails(id)).toMatchObject({
    attendees: ['bruno', 'teo'],
    version: 2,
  })
  await snap(page, info, 'open-after')
})

test('editing the Presentes of a told Session opens the correction', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'one project writes this fixture')
  const id = await openSession()
  await engineRun((engine) =>
    engine.run(
      recordFeedback({
        session: id,
        film: 'Café Amargo',
        ratings: ['bruno=4', 'iara=4'],
      }),
      owner,
    ),
  )
  await loginAsBruno(page)
  await page.goto(`/sessoes/${id}`)
  await snap(page, info, 'told-before')
  await replaceIaraWithTeo(page)
  await page.getByRole('button', { name: 'Continuar para a correção' }).click()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Corrigir o que contei',
  )
  await expect(page.getByRole('group', { name: /^Iara/ })).toHaveCount(0)
  expect(await sessionDetails(id)).toMatchObject({
    attendees: ['bruno', 'iara'],
  })
  await expect(
    page
      .getByRole('group', { name: /^Você/ })
      .getByRole('radio', { name: '8', exact: true }),
  ).toBeChecked()
  await page
    .getByRole('group', { name: /^Teo/ })
    .getByRole('radio', { name: '9', exact: true })
    .check()
  await snap(page, info, 'told-correction')
  await page.getByRole('button', { name: 'Gravar a correção' }).click()

  await expect(page.getByText('Correção gravada')).toBeVisible()
  expect(await sessionDetails(id)).toMatchObject({
    attendees: ['bruno', 'teo'],
  })
  const feedback = await engineRun((engine) => engine.run(recordedFeedback(id)))
  expect(
    feedback?.reactions.map(({ person, rating }) => [person, rating]),
  ).toEqual([
    ['bruno', 8],
    ['teo', 9],
  ])
  await snap(page, info, 'told-after')
})
