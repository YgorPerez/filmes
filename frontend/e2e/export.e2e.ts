import { readFileSync } from 'node:fs'
import { exportRatings } from '@filmes/engine'
import { engineRun, expect, loginAsBruno, test } from './support'

/** The file the engine writes for `person`, over the same fixture copy the
 * app serves. */
const engineFile = async (person: string) =>
  (await engineRun((engine) => engine.run(exportRatings(person, 'imdb'))))
    .content

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
