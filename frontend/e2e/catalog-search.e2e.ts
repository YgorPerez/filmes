// The Catálogo search of the screens that take IDs (#128), over the build
// and on the fixture copy, with the JavaScript off: each search is a plain
// GET, each "Usar" a plain link. Read only but for one Session the engine
// opens for Bruno alone, whose Feedback is filled and never sent.
// `E2E_SCREENSHOTS=<folder>` saves a capture of each screen.

import { recommendSession } from '@filmes/engine'
import { expect, test, type Page } from '@playwright/test'
import { engineRun, loginAsBruno, section, snap } from './support'

test.use({ javaScriptEnabled: false })

const search = (page: Page, query: string) =>
  section(page, 'Buscar no Catálogo')
    .getByRole('searchbox')
    .fill(query)
    .then(() =>
      section(page, 'Buscar no Catálogo')
        .getByRole('button', { name: 'Buscar' })
        .click(),
    )

const results = (page: Page) =>
  section(page, 'Buscar no Catálogo').getByRole('listitem')

test('on the Pessoa page, a director by name with accents gives her Q…', async ({
  page,
}, info) => {
  await loginAsBruno(page)
  await page.goto('/pessoas/iara')
  await search(page, 'LIA MOURA')

  await expect(page).toHaveURL(/\/pessoas\/iara\?buscar=LIA\+MOURA$/)
  await expect(results(page)).toHaveCount(2)
  await expect(results(page).first()).toContainText('Q9000006')
  await expect(results(page).first()).toContainText('Pequenos Milagres (2019)')
  await expect(results(page).nth(1)).toContainText('Q9006701')
  await snap(page, info, 'busca-pessoa')

  await search(page, 'maré')
  await expect(results(page).first()).toContainText('Maré Baixa (2015)')
  await expect(results(page).first()).toContainText('tt9000102')
})

test('Nova Sessão: two searches fill “Parecido com”', async ({
  page,
}, info) => {
  await loginAsBruno(page)
  await page.goto('/sessoes/nova')
  await search(page, 'farol')
  await page.getByRole('link', { name: 'Usar O Farol de Areia (2012)' }).click()
  await search(page, 'mare baixa')
  await page.getByRole('link', { name: 'Usar Maré Baixa (2015)' }).click()

  await expect(page.getByLabel('Parecido com', { exact: false })).toHaveValue(
    'tt9000101,tt9000102',
  )
  await snap(page, info, 'busca-nova-sessao')
})

test('Feedback: the film the search found is “Outro filme”', async ({
  page,
}, info) => {
  const { session } = await engineRun((engine) =>
    engine.run(recommendSession({ attendees: ['dono'], count: 2 }), {
      owner: 'bruno',
    }),
  )
  await loginAsBruno(page)
  await page.goto(`/feedback/${encodeURIComponent(session.id)}`)
  await search(page, 'fronteira (2012)')
  await expect(results(page)).toHaveCount(1)
  await page.getByRole('link', { name: 'Usar Fronteira II (2012)' }).click()

  await expect(page.getByLabel('Outro filme')).toBeChecked()
  await expect(
    page.getByLabel('Título ou ID do IMDb', { exact: false }),
  ).toHaveValue('tt9001903')
  await snap(page, info, 'busca-feedback')
})
