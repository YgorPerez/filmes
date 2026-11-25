import { readFileSync } from 'node:fs'
import { exportRatings, makeEngine } from '@filmes/engine'
import { expect, test, type Page } from '@playwright/test'

/** The file the engine writes for `person`, over the same fixture copy the
 * app serves (`playwright.config.ts`). */
async function engineFile(person: string): Promise<string> {
  const root = process.env.E2E_ENGINE
  const engine = makeEngine({
    FILMES_CONFIG: `${root}/config`,
    FILMES_DADOS: `${root}/data`,
    FILMES_BANCO: `${root}/filmes.sqlite`,
    FILMES_HOJE: '2026-11-20',
  })
  try {
    const outcome = await engine.run(exportRatings(person, 'imdb'))
    if (outcome.exitCode !== 0) throw new Error(JSON.stringify(outcome.output))
    return outcome.output.content
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

test('the Dono downloads a Pessoa’s IMDb CSV, equal to the engine’s', async ({
  page,
}) => {
  await loginAsBruno(page)
  await page.getByRole('link', { name: 'Exportar Notas' }).click()
  await expect(page).toHaveURL(/\/exportar$/)
  await expect(
    page.getByRole('heading', { name: 'Exportar Notas' }),
  ).toBeVisible()
  await expect(page.getByText('Import or Export Data')).toBeVisible()

  // His own Notas are the ones chosen when the page opens.
  const person = page.getByLabel('Pessoa')
  await expect(person).toHaveValue('bruno')

  for (const slug of ['bruno', 'iara']) {
    await person.selectOption(slug)
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Baixar CSV do IMDb' }).click(),
    ])
    expect(download.suggestedFilename()).toBe(`filmes-${slug}-imdb.csv`)
    const saved = readFileSync(await download.path(), 'utf8')
    expect(saved).toBe(await engineFile(slug))
    expect(saved.split('\r\n').length).toBeGreaterThan(2)
    await expect(page).toHaveURL(/\/exportar$/)
  }
})

test('a Pessoa that is gone sends the Dono back with the reason', async ({
  page,
}) => {
  await loginAsBruno(page)
  await page.goto('/exportar/imdb.csv?pessoa=ninguem')
  await expect(page).toHaveURL(/\/exportar\?erro=pessoa$/)
  await expect(page.getByRole('alert')).toContainText(
    'não está mais no repo de dados',
  )
})

test('the download needs a Dono', async ({ request }) => {
  const response = await request.get('/exportar/imdb.csv?pessoa=bruno', {
    maxRedirects: 0,
  })
  expect(response.status()).toBe(303)
  expect(response.headers()['location']).toBe('/entrar')
})
