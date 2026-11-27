import { readFileSync } from 'node:fs'
import { exportRatings, type ExportFormat } from '@filmes/engine'
import { type Page } from '@playwright/test'
import { engineRun, expect, loginAsBruno, section, tab, test } from './support'

/** The file the engine writes for `person`, over the same fixture copy the
 * app serves. */
const engineFile = async (person: string, format: ExportFormat) =>
  (await engineRun((engine) => engine.run(exportRatings(person, format))))
    .content

const LINKS: Record<ExportFormat, string> = {
  imdb: 'Baixar CSV do IMDb',
  letterboxd: 'Baixar CSV do Letterboxd',
}

/** Downloads the CSV from the Notas section of the page on screen, and
 * checks it is the engine's, byte for byte. */
async function download(
  page: Page,
  slug: string,
  format: ExportFormat = 'imdb',
) {
  const notes = section(page, 'Notas')
  // Folded under the Notas (#273).
  await notes.getByText('Baixar as Notas em CSV', { exact: true }).click()
  await expect(notes.getByText('Import or Export Data')).toBeVisible()
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    notes.getByRole('link', { name: LINKS[format] }).click(),
  ])
  expect(file.suggestedFilename()).toBe(`filmes-${slug}-${format}.csv`)
  const saved = readFileSync(await file.path(), 'utf8')
  expect(saved).toBe(await engineFile(slug, format))
  expect(saved.split('\r\n').length).toBeGreaterThan(2)
}

test('the Dono downloads her own IMDb CSV and a Pessoa’s, equal to the engine’s', async ({
  page,
}) => {
  await loginAsBruno(page)
  await tab(page, 'Meu gosto').click()
  await download(page, 'bruno')
  await expect(page).toHaveURL(/\/meu-gosto$/)

  await tab(page, 'Pessoas').click()
  await page.getByRole('link', { name: /Iara/ }).click()
  await download(page, 'iara')
  await expect(page).toHaveURL(/\/pessoas\/iara$/)
})

test('the Dono downloads a Pessoa’s Letterboxd CSV, equal to the engine’s', async ({
  page,
}) => {
  await loginAsBruno(page)
  await tab(page, 'Pessoas').click()
  await page.getByRole('link', { name: /Iara/ }).click()
  await download(page, 'iara', 'letterboxd')
  await expect(page).toHaveURL(/\/pessoas\/iara$/)
})

test('a Pessoa that is gone sends the Dono back to Pessoas with the reason', async ({
  page,
}) => {
  await loginAsBruno(page)
  await page.goto('/exportar/imdb.csv?pessoa=ninguem')
  await expect(page).toHaveURL(/\/pessoas\?erro=pessoa$/)
  await expect(page.getByRole('alert')).toContainText('não existe mais')
})

test('a download that fails shows the page with the reason, not a file', async ({
  page,
}) => {
  await loginAsBruno(page)
  await tab(page, 'Meu gosto').click()
  // The login ran out while the page was open: the link goes to log in.
  await page.context().clearCookies()
  await section(page, 'Notas')
    .getByText('Baixar as Notas em CSV', { exact: true })
    .click()
  await section(page, 'Notas')
    .getByRole('link', { name: 'Baixar CSV do IMDb' })
    .click()
  await expect(page).toHaveURL(/\/entrar$/)
  await expect(
    page.getByRole('link', { name: 'Entrar com Google' }),
  ).toBeVisible()
})

test('the old export page is Meu gosto', async ({ page }) => {
  await loginAsBruno(page)
  await page.goto('/exportar')
  await expect(page).toHaveURL(/\/meu-gosto$/)
})

test('the download needs a Dono', async ({ request }) => {
  for (const format of ['imdb', 'letterboxd']) {
    const response = await request.get(`/exportar/${format}.csv?pessoa=bruno`, {
      maxRedirects: 0,
    })
    expect(response.status()).toBe(303)
    expect(response.headers()['location']).toBe('/entrar')
  }
})
