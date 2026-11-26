import { readFileSync } from 'node:fs'
import { exportRatings } from '@filmes/engine'
import { type Page } from '@playwright/test'
import { engineRun, expect, loginAsBruno, section, tab, test } from './support'

/** The file the engine writes for `person`, over the same fixture copy the
 * app serves. */
const engineFile = async (person: string) =>
  (await engineRun((engine) => engine.run(exportRatings(person, 'imdb'))))
    .content

/** Downloads the CSV from the Notas section of the page on screen, and
 * checks it is the engine's, byte for byte. */
async function download(page: Page, slug: string) {
  const notes = section(page, 'Notas')
  await expect(notes.getByText('Import or Export Data')).toBeVisible()
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    notes.getByRole('link', { name: 'Baixar CSV do IMDb' }).click(),
  ])
  expect(file.suggestedFilename()).toBe(`filmes-${slug}-imdb.csv`)
  const saved = readFileSync(await file.path(), 'utf8')
  expect(saved).toBe(await engineFile(slug))
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

test('a Pessoa that is gone sends the Dono back to Pessoas with the reason', async ({
  page,
}) => {
  await loginAsBruno(page)
  await page.goto('/exportar/imdb.csv?pessoa=ninguem')
  await expect(page).toHaveURL(/\/pessoas\?erro=pessoa$/)
  await expect(page.getByRole('alert')).toContainText(
    'não está mais no repo de dados',
  )
})

test('the old export page is Meu gosto', async ({ page }) => {
  await loginAsBruno(page)
  await page.goto('/exportar')
  await expect(page).toHaveURL(/\/meu-gosto$/)
})

test('the download needs a Dono', async ({ request }) => {
  const response = await request.get('/exportar/imdb.csv?pessoa=bruno', {
    maxRedirects: 0,
  })
  expect(response.status()).toBe(303)
  expect(response.headers()['location']).toBe('/entrar')
})
