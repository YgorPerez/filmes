// The Imports screens over the build, on the fixture copy (never the real
// filmes-dados), with TMDB and the Letterboxd RSS answering from the
// recordings. The two projects run at once on the same copy, and the queue
// is shared: the desktop imports the Letterboxd ZIP and the RSS into Olga
// and works the queue; the mobile imports Lia's Trakt export and resolves
// nothing for the Letterboxd queue. `E2E_SCREENSHOTS=<folder>` saves each screen there.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { personImports, viewQueue } from '@filmes/engine'
import { expect, test, type Page } from '@playwright/test'
import { zipOf } from '../../packages/engine/test/imports/zip.ts'
import {
  addPerson,
  engineRun,
  loginAsBruno,
  notice,
  section,
  snap,
} from './support'

const FIXTURE = join(import.meta.dirname, '../../tests/fixture')

const folderZip = (folder: string, prefix = '') =>
  zipOf(
    readdirSync(join(FIXTURE, folder))
      .sort()
      .map(
        (name) =>
          [prefix + name, readFileSync(join(FIXTURE, folder, name))] as const,
      ),
  )

const importsOf = (person: string) =>
  engineRun((engine) => engine.run(personImports(person)))

/** Opens the upload's `<details>` and sends the file. */
async function upload(
  page: Page,
  kind: 'Export do Letterboxd' | 'Export do Trakt',
  name: string,
  buffer: Buffer,
) {
  const area = section(page, 'Trazer um export')
  await area.getByText(kind, { exact: true }).click()
  const form = area.getByRole('form', { name: kind })
  await form
    .getByLabel('Arquivo ZIP')
    .setInputFiles({ name, mimeType: 'application/zip', buffer })
  await form.getByRole('button', { name: 'Importar' }).click()
}

async function removeImport(page: Page, original: string) {
  const files = section(page, 'Arquivos importados')
  await files.getByLabel(`Tirar ${original}`).click()
  await files
    .getByRole('listitem')
    .filter({ hasText: original })
    .getByRole('button', { name: 'Tirar este import' })
    .click()
}

test('the Dono imports a Letterboxd ZIP and works the queue', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'the queue is shared: one project')
  await addPerson('Olga')
  await loginAsBruno(page)
  await page.getByRole('link', { name: 'Importar' }).click()
  await expect(page).toHaveURL(/\/importar$/)
  await expect(page.getByRole('heading', { name: 'Importar' })).toBeVisible()
  await snap(page, info, 'importar')

  await page.getByRole('link', { name: /Olga/ }).click()
  await expect(page).toHaveURL(/\/importar\/olga$/)
  await expect(
    page.getByRole('heading', { name: 'Imports de Olga' }),
  ).toBeVisible()
  await expect(section(page, 'Arquivos importados')).toContainText(
    'Nenhum import ainda.',
  )
  await snap(page, info, 'importar-pessoa-vazia')

  await upload(
    page,
    'Export do Letterboxd',
    'letterboxd-olga.zip',
    folderZip('letterboxd/olga'),
  )
  await expect(notice(page)).toHaveText(
    'Export do Letterboxd importado: 14 Fatos novos.',
  )
  await expect(section(page, 'Arquivos importados')).toContainText(
    'letterboxd-olga.zip',
  )
  const letterboxd = section(page, 'Letterboxd')
  await expect(letterboxd).toContainText('10 filmes')
  await expect(letterboxd).toContainText(
    '2 filmes esperam na fila de resolução',
  )
  await snap(page, info, 'importar-letterboxd')

  await letterboxd.getByRole('link', { name: 'Abrir a fila' }).click()
  await expect(page).toHaveURL(/\/fila$/)
  const wind = section(page, 'Vento Norte (2020)')
  const lost = section(page, 'Filme Perdido (2001)')
  await expect(wind).toContainText('Nordwind')
  await expect(lost).toContainText('de Olga')
  await snap(page, info, 'fila')

  // Something that is not a film: the queue says why, and nothing changes.
  const confirmLost = lost.getByRole('form', {
    name: 'Confirmar Filme Perdido (2001)',
  })
  await confirmLost.getByLabel(/^Filme/).fill('um filme qualquer')
  await confirmLost.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page).toHaveURL(/\/fila\?erro=filme$/)
  await expect(page.getByRole('alert')).toContainText('Use um tt…')

  await wind
    .getByRole('button', { name: 'É este: Vento Norte (2020), TMDB 9102' })
    .click()
  await expect(notice(page)).toHaveText(
    'Filme confirmado: os Fatos dele entraram para quem o tem.',
  )
  await expect(section(page, 'Vento Norte (2020)')).toHaveCount(0)

  await lost.getByText('Descartar este filme').click()
  const discard = lost.getByRole('form', {
    name: 'Descartar Filme Perdido (2001)',
  })
  await discard.getByLabel(/^Motivo/).fill('não é filme')
  await discard.getByRole('button', { name: 'Descartar' }).click()
  await expect(notice(page)).toHaveText('Filme descartado: saiu da fila.')
  const queue = await engineRun((engine) => engine.run(viewQueue))
  expect(queue.items.map((i) => i.name)).not.toContain('Filme Perdido')
  expect(queue.items.map((i) => i.name)).not.toContain('Vento Norte')

  await page
    .getByRole('form', { name: 'Perguntar ao TMDB de novo' })
    .getByRole('button')
    .click()
  await expect(notice(page)).toContainText('TMDB consultado de novo')
  await snap(page, info, 'fila-decidida')

  await page.goto('/importar/olga')
  await expect(section(page, 'Letterboxd')).toContainText('1 pelo Dono')

  // Her RSS, with her consent. Its TMDB ids would resolve Vento Norte for
  // everyone, so it comes after the queue.
  const rss = section(page, 'RSS do Letterboxd')
  await rss.getByLabel(/^Usuário no Letterboxd/).fill('olga_farol')
  await rss.getByLabel(/concordou que o filmes baixe/).check()
  await rss.getByRole('button', { name: 'Baixar e importar' }).click()
  await expect(notice(page)).toContainText('RSS do Letterboxd importado')
  await expect(section(page, 'Arquivos importados')).toContainText(
    'https://letterboxd.com/olga_farol/rss/',
  )
  await snap(page, info, 'importar-rss')
  await removeImport(page, 'letterboxd-olga.zip')
  await expect(notice(page)).toContainText('Import tirado')
  expect((await importsOf('olga')).imports.map((i) => i.kind)).toEqual([
    'letterboxd-rss',
  ])
})

test('the Dono imports a Trakt export; an RSS that does not exist says so', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'Lia is the mobile’s')
  await addPerson('Lia')
  await loginAsBruno(page)
  await page.goto('/importar/lia')

  await upload(
    page,
    'Export do Trakt',
    'trakt-lia.zip',
    folderZip('trakt', 'trakt-export/'),
  )
  await expect(notice(page)).toHaveText(
    'Export do Trakt importado: 3 Fatos novos.',
  )
  await expect(section(page, 'Trakt')).toContainText(
    '2 Notas e 1 Já visto do Trakt.',
  )
  await snap(page, info, 'importar-trakt')

  const rss = section(page, 'RSS do Letterboxd')
  await rss.getByLabel(/^Usuário no Letterboxd/).fill('ninguem_aqui')
  await rss.getByLabel(/concordou que o filmes baixe/).check()
  await rss.getByRole('button', { name: 'Baixar e importar' }).click()
  await expect(page.getByRole('alert')).toContainText(
    'O Letterboxd não tem RSS para esse usuário',
  )

  await removeImport(page, 'trakt-lia.zip')
  await expect(notice(page)).toHaveText('Import tirado: 3 Fatos saíram.')
  expect((await importsOf('lia')).imports).toEqual([])
})

test('the RSS needs her consent, a Dono and this site', async ({
  page,
  baseURL,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'a request is the same anywhere')
  const anonymous = await page.request.post('/importar/teo/acao', {
    form: { acao: 'rss', usuario: 'olga_farol', consentimento: 'sim' },
    maxRedirects: 0,
  })
  expect(anonymous.status()).toBe(303)
  expect(anonymous.headers()['location']).toBe('/entrar')

  await loginAsBruno(page)
  const noConsent = await page.request.post('/importar/teo/acao', {
    form: { acao: 'rss', usuario: 'olga_farol' },
    headers: { Origin: baseURL ?? '' },
    maxRedirects: 0,
  })
  expect(noConsent.headers()['location']).toBe(
    '/importar/teo?erro=consentimento',
  )
  const elsewhere = await page.request.post('/fila/acao', {
    form: { acao: 'reprocessar' },
    headers: { Origin: 'https://elsewhere.example' },
    maxRedirects: 0,
  })
  expect(elsewhere.status()).toBe(403)
})

test('a name no Pessoa has says so', async ({ page }) => {
  await loginAsBruno(page)
  await page.goto('/importar/ninguem')
  await expect(page.getByRole('alert')).toContainText(
    'Nenhuma Pessoa com esse nome',
  )
})
