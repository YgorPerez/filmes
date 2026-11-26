// Operações over the build, on this file's fixture copy (never the real
// filmes-dados). Bruno, one of the fixture's two Donos, becomes admin here,
// on the copy. Only the desktop evaluates (one run at a time per server,
// and the two projects share it). `E2E_SCREENSHOTS=<folder>` saves each
// screen there.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  accountMenu,
  engineRoot,
  expect,
  loginAsBruno,
  makeBrunoAdmin,
  section,
  snap,
  test,
} from './support'

test.beforeAll(() => {
  makeBrunoAdmin()
})

test('the admin consults the database, read-only', async ({ page }, info) => {
  await loginAsBruno(page)
  const menu = await accountMenu(page)
  await menu.getByRole('link', { name: 'Operações' }).click()
  await expect(page).toHaveURL(/\/operacoes$/)
  await expect(page.getByRole('heading', { name: 'Operações' })).toBeVisible()
  await snap(page, info, 'operacoes')

  const consult = section(page, 'Consultar o banco')
  await consult
    .getByLabel('SQL')
    .fill(
      "SELECT slug, nome FROM pessoas WHERE slug IN ('bruno', 'iara') ORDER BY slug",
    )
  await consult.getByRole('button', { name: 'Consultar' }).click()
  await expect(page).toHaveURL(/\/operacoes\?sql=/)
  const table = consult.getByRole('table')
  await expect(table.getByRole('columnheader')).toHaveText(['slug', 'nome'])
  await expect(table.getByRole('row')).toHaveText([
    'slugnome',
    'brunoBruno',
    'iaraIara',
  ])
  await expect(consult.getByRole('status')).toHaveText('2 linhas.')
  await snap(page, info, 'operacoes-consulta')

  await consult.getByLabel('SQL').fill('DELETE FROM pessoas')
  await consult.getByRole('button', { name: 'Consultar' }).click()
  await expect(consult.getByRole('alert')).toContainText(
    'O console só lê o banco. Use um SELECT.',
  )
  await expect(consult.getByRole('alert')).toContainText('read_only')
  await snap(page, info, 'operacoes-consulta-recusada')
})

test('the admin evaluates the Recommendation and reads the report', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'mobile', 'one evaluation per server')
  await loginAsBruno(page)
  await page.goto('/operacoes')

  // No remote in the e2e: the push is off, and says so.
  await expect(section(page, 'Envio dos dados')).toContainText(
    'O envio está desligado neste servidor',
  )

  const evaluation = section(page, 'Avaliar a Recomendação')
  await evaluation.getByRole('button', { name: 'Avaliar' }).click()
  await expect(page).toHaveURL(/\/operacoes\?feito=avaliando$/)
  await expect(evaluation.getByRole('status')).toContainText(
    'Relatório gravado em 2026-11-20.md',
    { timeout: 30_000 },
  )
  // Other files add Pessoas and Notas meanwhile: the numbers vary.
  await expect(evaluation.getByRole('row', { name: /^Pessoas/ })).toBeVisible()
  await evaluation.getByText('Relatório de 2026-11-20').click()
  await expect(evaluation.getByText(/Recall@50/).first()).toBeVisible()
  await snap(page, info, 'operacoes-avaliacao')

  const report = join(engineRoot(), 'evaluations/2026-11-20.md')
  expect(readFileSync(report, 'utf8')).toContain('Recall@50')
})
