// The Imports screens over the build, on the fixture copy (never the real
// filmes-dados), with TMDB and the Letterboxd RSS answering from the
// recordings. The two projects run at once on the same copy, and the queue
// is shared: the desktop imports the Letterboxd ZIP and the RSS into Olga
// and works the queue; the mobile imports Lia's Trakt export and resolves
// nothing for the Letterboxd queue. `E2E_SCREENSHOTS=<folder>` saves each screen there.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { personImports, personView, viewQueue } from '@filmes/engine'
import { type Locator, type Page, type TestInfo } from '@playwright/test'
import { zipOf } from '../../packages/engine/test/imports/zip.ts'
import {
  tab,
  addOwner,
  addPerson,
  engineRun,
  expect,
  loginAs,
  loginAsBruno,
  notice,
  section,
  snap,
  test,
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

const LETTERBOXD_UPLOAD = 'Envie o ZIP aqui'
const OTHER_UPLOAD = 'De outro site'
const PROFILE = 'Perfil do Letterboxd'
const RESULTS = 'O que já entrou'

/** Once something came in, the forms fold under "Importar de novo". */
async function openForms(page: Page) {
  const again = page.getByText('Importar de novo ou de outro site')
  if ((await again.count()) === 0) return
  const open = await again.evaluate(
    (summary) => (summary.parentElement as HTMLDetailsElement).open,
  )
  if (!open) await again.click()
}

/** Sends a file through the guided Letterboxd upload, or the other sites'
 * (`outro`): the server tells the service by what the file holds. */
async function upload(
  page: Page,
  name: string,
  buffer: Buffer,
  mimeType = 'application/zip',
  to: 'letterboxd' | 'outro' = 'letterboxd',
) {
  await openForms(page)
  const form = page.getByRole('form', {
    name: to === 'letterboxd' ? LETTERBOXD_UPLOAD : OTHER_UPLOAD,
  })
  await form.locator('input[type=file]').setInputFiles({
    name,
    mimeType,
    buffer,
  })
  await form
    .getByRole('button', {
      name: to === 'letterboxd' ? 'Importar o ZIP' : 'Importar',
      exact: true,
    })
    .click()
}

/** The profile's form, open. */
async function profile(page: Page) {
  await openForms(page)
  return page.getByRole('form', { name: PROFILE })
}

async function removeImport(page: Page, original: string) {
  const files = section(page, 'Arquivos e perfis')
  await files.getByLabel(`Tirar ${original}`).click()
  await files
    .getByRole('listitem')
    .filter({ hasText: original })
    .getByRole('button', { name: 'Tirar este import' })
    .click()
}

async function openOlgaImports(page: Page, info: TestInfo) {
  // A Pessoa's imports are on her page, under Pessoas.
  await tab(page, 'Pessoas').click()
  await page.getByRole('link', { name: /Olga/ }).click()
  await expect(page).toHaveURL(/\/pessoas\/olga$/)
  await section(page, 'Notas')
    .getByRole('link', {
      name: 'Importar Notas',
    })
    .click()
  await expect(page).toHaveURL(/\/pessoas\/olga\/importar$/)
  await expect(
    page.getByRole('heading', { name: 'Importar as Notas de Olga' }),
  ).toBeVisible()
  // Nothing imported: the guided flow is the page, and Olga's diary needs
  // her yes.
  await expect(section(page, 'Arquivos e perfis')).toHaveCount(0)
  await expect(section(page, RESULTS)).toHaveCount(0)
  await expect(
    section(page, 'Do Letterboxd').getByRole('link', {
      name: 'Abrir letterboxd.com/settings/data',
    }),
  ).toHaveAttribute('href', 'https://letterboxd.com/settings/data/')
  await expect((await profile(page)).getByRole('checkbox')).toHaveCount(1)
  await snap(page, info, 'importar-pessoa-vazia')
}

/** Gives the section of what came in. */
async function importOlgaZip(page: Page, info: TestInfo) {
  await upload(page, 'letterboxd-olga.zip', folderZip('letterboxd/olga'))
  await expect(notice(page)).toContainText(
    'O ZIP do Letterboxd entrou: entraram',
  )
  await expect(section(page, 'Arquivos e perfis')).toContainText(
    'letterboxd-olga.zip',
  )
  const letterboxd = section(page, RESULTS)
  await expect(letterboxd).toContainText('Letterboxd: 10 filmes')
  await expect(letterboxd).toContainText(
    '2 filmes do Letterboxd esperam você confirmar qual é',
  )
  await snap(page, info, 'importar-letterboxd')
  return letterboxd
}

/** Refuses what is not a film, confirms Vento Norte, takes it back and
 * confirms it again; gives the section of Filme Perdido. */
async function confirmInQueue(page: Page, info: TestInfo, letterboxd: Locator) {
  await letterboxd.getByRole('link', { name: 'Resolver agora' }).click()
  await expect(page).toHaveURL(/\/meu-gosto\/fila\?de=olga$/)
  const wind = section(page, 'Vento Norte (2020)')
  const lost = section(page, 'Filme Perdido (2001)')
  await expect(wind).toContainText('Nordwind')
  await expect(lost).toContainText('Conta no gosto de Olga')
  await snap(page, info, 'fila')

  // Something that is not a film: the queue says why, and nothing changes.
  await lost.getByText('Procurar outro título').click()
  const confirmLost = lost.getByRole('form', {
    name: 'Confirmar Filme Perdido (2001)',
  })
  await confirmLost.getByLabel(/^Link ou ID/).fill('um filme qualquer')
  await confirmLost.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page).toHaveURL(/\/meu-gosto\/fila\?erro=filme&de=olga$/)
  await expect(page.getByRole('alert')).toContainText('Cole um link')

  // Each suggestion says its director, runtime and country (#274).
  await wind
    .getByRole('button', {
      name: /^É este: Vento Norte \(2020\), Direção: Helena Prado/,
    })
    .click()
  await expect(notice(page)).toHaveText(
    'Vento Norte (2020) confirmado: as Notas dele entraram no gosto de quem o tem.',
  )
  await expect(section(page, 'Vento Norte (2020)')).toHaveCount(0)
  // Taken back, it waits again; then confirmed for good.
  await page
    .getByRole('button', {
      name: 'Desfazer a decisão sobre Vento Norte (2020)',
    })
    .click()
  await expect(notice(page)).toHaveText(
    'Vento Norte (2020) voltou para a fila.',
  )
  await section(page, 'Vento Norte (2020)')
    .getByRole('button', {
      name: /^É este: Vento Norte \(2020\), Direção: Helena Prado/,
    })
    .click()
  await expect(section(page, 'Vento Norte (2020)')).toHaveCount(0)
  return lost
}

async function dropAndSearchAgain(page: Page, info: TestInfo, lost: Locator) {
  await lost
    .getByRole('button', { name: 'Não é filme: Filme Perdido (2001)' })
    .click()
  await expect(notice(page)).toHaveText('Filme Perdido (2001) saiu da fila.')
  const queue = await engineRun((engine) => engine.run(viewQueue))
  expect(queue.items.map((i) => i.name)).not.toContain('Filme Perdido')
  expect(queue.items.map((i) => i.name)).not.toContain('Vento Norte')

  await page
    .getByRole('form', { name: 'Procurar de novo' })
    .getByRole('button')
    .click()
  await expect(notice(page)).toContainText('Procurei de novo')
  await snap(page, info, 'fila-decidida')
}

async function readRssAndRemoveZip(page: Page, info: TestInfo) {
  await page.goto('/importar/olga')
  // Nothing waits for her: the count says 0 and no film asks to be solved.
  await expect(section(page, RESULTS)).toContainText('esperam você0')
  await expect(page.getByRole('link', { name: 'Resolver agora' })).toHaveCount(
    0,
  )

  // Her RSS, with her consent. Its TMDB ids would resolve Vento Norte for
  // everyone, so it comes after the queue.
  const rss = await profile(page)
  await rss
    .getByLabel(/^Nome do perfil no Letterboxd/)
    .fill('https://letterboxd.com/olga_farol/')
  await rss.getByLabel(/^Olga concordou que o filmes leia/).check()
  await rss.getByRole('button', { name: 'Ler o perfil' }).click()
  await expect(notice(page)).toContainText('Perfil do Letterboxd lido')
  await expect(section(page, 'Arquivos e perfis')).toContainText('@olga_farol')
  await snap(page, info, 'importar-rss')
  await removeImport(page, 'letterboxd-olga.zip')
  await expect(notice(page)).toContainText('Import tirado')
  expect((await importsOf('olga')).imports.map((i) => i.kind)).toEqual([
    'letterboxd-rss',
  ])
}

test('the Dono imports a Letterboxd ZIP and works the queue', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'the queue is shared: one project')
  await addPerson('Olga')
  await loginAsBruno(page)
  await openOlgaImports(page, info)
  const letterboxd = await importOlgaZip(page, info)
  const lost = await confirmInQueue(page, info, letterboxd)
  await dropAndSearchAgain(page, info, lost)
  await readRssAndRemoveZip(page, info)
})

test('the Dono imports a Trakt ZIP; a ZIP of neither and a profile that does not exist say so', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'Lia is the mobile’s')
  await addPerson('Lia')
  await loginAsBruno(page)
  await page.goto('/importar/lia')

  await upload(page, 'outro.zip', zipOf([['notas.csv', 'Nome,Nota\n']]))
  // The refusal shows under the upload that sent it.
  await expect(
    page.getByRole('form', { name: LETTERBOXD_UPLOAD }).getByRole('alert'),
  ).toContainText(
    'Esse arquivo não parece ser do Letterboxd, do Trakt, do IMDb, do Simkl nem do TV Time.',
  )

  await upload(
    page,
    'trakt-lia.zip',
    folderZip('trakt', 'trakt-export/'),
    'application/zip',
    'outro',
  )
  await expect(notice(page)).toHaveText(
    // The film of the history has a Nota too: no Já visto alone (#274).
    'O ZIP do Trakt entrou: entraram 2 Notas novas.',
  )
  await expect(section(page, RESULTS)).not.toContainText('Letterboxd:')
  // The card counts by film, as the notice (#274).
  await expect(section(page, RESULTS)).toContainText('Trakt: 2 Notas')
  await expect(section(page, RESULTS)).not.toContainText('Já visto')
  await snap(page, info, 'importar-trakt')

  const rss = await profile(page)
  await rss.getByLabel(/^Nome do perfil no Letterboxd/).fill('@ninguem_aqui')
  await rss.getByLabel(/^Lia concordou que o filmes leia/).check()
  await rss.getByRole('button', { name: 'Ler o perfil' }).click()
  await expect(
    page.getByRole('form', { name: PROFILE }).getByRole('alert'),
  ).toContainText('O Letterboxd não tem um perfil com esse nome')

  await removeImport(page, 'trakt-lia.zip')
  await expect(notice(page)).toHaveText(
    'Import tirado: o que só ele trazia saiu do gosto.',
  )
  expect((await importsOf('lia')).imports).toEqual([])
})

test('the Dono imports an IMDb ratings CSV', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Nina is the desktop’s')
  await addPerson('Nina')
  await loginAsBruno(page)
  await page.goto('/importar/nina')

  await upload(
    page,
    'ratings.csv',
    readFileSync(join(FIXTURE, 'imdb/vera.csv')),
    'text/csv',
    'outro',
  )
  await expect(notice(page)).toHaveText(
    'O CSV do IMDb entrou: entraram 3 Notas novas. 1 filme ficou de fora: o Catálogo do filmes não tem.',
  )
  await expect(section(page, RESULTS)).toContainText('IMDb: 3 Notas')
  await snap(page, info, 'importar-imdb')
  expect((await importsOf('nina')).imdb).toEqual({ ratings: 3 })
})

test('the Dono imports a Simkl backup ZIP', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'Sara is the phone’s')
  await addPerson('Sara')
  await loginAsBruno(page)
  await page.goto('/importar/sara')

  await upload(
    page,
    'SimklBackup.zip',
    zipOf([
      [
        'SimklBackup.json',
        readFileSync(join(FIXTURE, 'simkl/SimklBackup.json')),
      ],
    ]),
    'application/zip',
    'outro',
  )
  await expect(notice(page)).toHaveText(
    /^O backup do Simkl entrou: entraram 3 Notas novas.* 2 filmes ficaram de fora: o Catálogo do filmes não tem\.$/,
  )
  await expect(section(page, RESULTS)).toContainText(
    'Simkl: 3 Notas, 2 Já vistos e 1 filme na watchlist',
  )
  await snap(page, info, 'importar-simkl')
  expect((await importsOf('sara')).simkl).toEqual({
    ratings: 3,
    seen: 2,
    watchlist: 1,
  })
})

test('the Dono imports a TV Time backup', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Ravi is the desktop’s')
  await addPerson('Ravi')
  await loginAsBruno(page)
  await page.goto('/importar/ravi')

  // The Liberator's films that name their tconst: none for the shared queue.
  const movies = (
    JSON.parse(
      readFileSync(join(FIXTURE, 'tvtime/liberator/movies.json'), 'utf8'),
    ) as { id: { imdb: string } }[]
  ).filter((movie) => movie.id.imdb.startsWith('tt'))
  await upload(
    page,
    'tv-time-export.zip',
    zipOf([['movies.json', JSON.stringify(movies)]]),
    'application/zip',
    'outro',
  )
  await expect(notice(page)).toHaveText(
    /^O backup do TV Time entrou: entraram 2 Notas novas.* 1 filme ficou de fora: o Catálogo do filmes não tem\.$/,
  )
  await expect(section(page, RESULTS)).toContainText(
    'TV Time: 2 Notas, 1 Já visto e 1 filme na watchlist',
  )
  await snap(page, info, 'importar-tvtime')
  expect((await importsOf('ravi')).tvtime).toEqual({
    ratings: 2,
    seen: 3,
    stated: 0,
    watchlist: 1,
  })
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
    '/pessoas/teo/importar?erro=consentimento',
  )
  const elsewhere = await page.request.post('/fila/acao', {
    form: { acao: 'reprocessar' },
    headers: { Origin: 'https://elsewhere.example' },
    maxRedirects: 0,
  })
  expect(elsewhere.status()).toBe(403)
})

test('the Dono’s own page asks no consent for her profile', async ({
  page,
}) => {
  await loginAsBruno(page)
  // The old address of his imports leads to Meu gosto's.
  await page.goto('/importar/bruno')
  await expect(page).toHaveURL(/\/meu-gosto\/importar$/)
  const rss = await profile(page)
  await expect(rss.getByLabel(/^Nome do perfil no Letterboxd/)).toBeVisible()
  await expect(rss.getByRole('checkbox')).toHaveCount(0)
})

test('a name no Pessoa has says so', async ({ page }) => {
  await loginAsBruno(page)
  await page.goto('/importar/ninguem')
  await expect(page.getByRole('alert')).toContainText(
    'Nenhuma Pessoa com esse nome',
  )
})

// The rating screen (#144), the Import's twin for a Dona with no Letterboxd
// nor Trakt: she gives Notas from her Fila and from the search, passes a
// film over, and Pronto writes them to her file in one go. Each project has
// its own Dona, so the other tests never see her Notas.
test('a Dona with no history rates from the Fila and the search, then Pronto', async ({
  page,
}, info) => {
  const slug = `nina-${info.project.name}`
  const email = `${slug}@example.org`
  await addOwner(`Nina ${info.project.name}`, email)
  await loginAs(page, email)
  await page.getByRole('link', { name: 'Dar notas' }).click()
  await expect(page).toHaveURL(/\/meu-gosto\/notas$/)

  const card = page.getByRole('article', { name: 'Filme para dar Nota' })
  await expect(card.getByRole('heading')).toHaveText('Pequenos Milagres')
  await snap(page, info, 'notas')
  await card.getByRole('button', { name: 'Nota 8' }).click()
  await expect(card.getByRole('heading')).toHaveText('Casa Cheia')
  await card.getByRole('button', { name: 'Não vi' }).click()
  await expect(card.getByRole('heading')).not.toHaveText('Casa Cheia')

  const search = section(page, 'Buscar no Catálogo')
  await search.getByRole('searchbox').fill('fronteira')
  await search.getByRole('button', { name: 'Buscar' }).click()
  await page.getByRole('link', { name: 'Dar nota a Fronteira (2008)' }).click()
  await expect(card.getByRole('heading')).toHaveText('Fronteira')
  await card.getByRole('button', { name: 'Nota 6' }).click()

  const mine = section(page, 'Ainda não gravadas')
  await expect(mine.getByRole('listitem')).toHaveCount(2)
  await snap(page, info, 'notas-rascunho')
  await page
    .getByRole('region', { name: 'Suas Notas desta vez' })
    .getByRole('button', { name: 'Pronto: gravar 2 Notas' })
    .click()

  await expect(notice(page)).toHaveText('2 Notas gravadas no seu gosto.')
  await expect(page.getByRole('link', { name: 'Pedir filme' })).toBeVisible()
  await expect(section(page, 'Ainda não gravadas')).toHaveCount(0)
  await page.getByRole('button', { name: 'Dar mais notas' }).click()
  await expect(card.getByRole('heading')).not.toHaveText('Pequenos Milagres')
  const view = await engineRun((engine) => engine.run(personView(slug)))
  expect(
    (view.ratings ?? [])
      .map((r) => [r.filmId, r.rating])
      .sort(([a], [b]) => String(a).localeCompare(String(b))),
  ).toEqual([
    ['tt9000401', 3],
    ['tt9000601', 4],
  ])
})

// Before the JavaScript (#240), the forms are the plain POST they always
// were: the upload goes multipart and the page comes back with what the
// server said.
test.describe('with the JavaScript off', () => {
  test.use({ javaScriptEnabled: false })

  test('the upload is a plain POST that comes back with the refusal', async ({
    page,
  }) => {
    await loginAsBruno(page)
    await page.goto('/meu-gosto/importar')
    await upload(page, 'outro.zip', zipOf([['notas.csv', 'Nome,Nota\n']]))
    await expect(page).toHaveURL(
      /\/meu-gosto\/importar\?erro=origem&de=letterboxd$/,
    )
    await expect(page.getByRole('alert')).toContainText(
      'Esse arquivo não parece ser do Letterboxd, do Trakt, do IMDb, do Simkl nem do TV Time.',
    )
  })
})
