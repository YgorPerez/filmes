// The Catálogo search of the screens that take IDs (#128), over the build
// and on the fixture copy, with JavaScript off. Each "Usar" is a plain link. Read only but for one Session the engine
// opens for Bruno alone, whose Feedback is filled and never sent.
// `E2E_SCREENSHOTS=<folder>` saves a capture of each screen.

import { recommendSession } from '@filmes/engine'
import { type Page } from '@playwright/test'
import { engineRun, expect, loginAsBruno, section, snap, test } from './support'

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
  // Folded until it is needed; open after a search, so only the first time.
  await page.getByRole('checkbox', { name: 'Iara' }).check()
  await page.getByLabel('Em uma frase', { exact: false }).fill('eu e a Iara')
  await page.getByText('Parecido com um filme?').click()
  await search(page, 'farol')
  await page.getByRole('link', { name: 'Usar O Farol de Areia (2012)' }).click()
  await search(page, 'mare baixa')
  await page.getByRole('link', { name: 'Usar Maré Baixa (2015)' }).click()

  await expect(page.getByLabel('Parecido com', { exact: false })).toHaveValue(
    'tt9000101,tt9000102',
  )
  await expect(page.getByRole('checkbox', { name: 'Iara' })).toBeChecked()
  await expect(page.getByLabel('Em uma frase', { exact: false })).toHaveValue(
    'eu e a Iara',
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
  await page.goto(`/sessoes/${encodeURIComponent(session.id)}/contar`)
  await page.getByLabel('Outro filme').check()
  await search(page, 'fronteira (2012)')
  await expect(results(page)).toHaveCount(1)
  await page.getByRole('link', { name: 'Usar Fronteira II (2012)' }).click()

  await expect(page.getByLabel('Outro filme')).toBeChecked()
  await expect(
    page.getByLabel('Título ou ID do IMDb', { exact: false }),
  ).toHaveValue('tt9001903')
  await snap(page, info, 'busca-feedback')
})

test('Feedback: the search and its “Usar” keep the reactions and comments', async ({
  page,
}) => {
  const { session } = await engineRun((engine) =>
    engine.run(recommendSession({ attendees: ['dono'], count: 2 }), {
      owner: 'bruno',
    }),
  )
  await loginAsBruno(page)
  await page.goto(`/sessoes/${encodeURIComponent(session.id)}/contar`)
  await page.getByLabel('Reação: Bruno').selectOption('nota:4,5')
  await page.getByLabel('Comentário: Bruno').fill('vale rever')
  await page.getByLabel('Outro filme').check()
  // Enter in the search box searches, without recording the Feedback.
  await section(page, 'Buscar no Catálogo')
    .getByRole('searchbox')
    .fill('fronteira (2012)')
  await section(page, 'Buscar no Catálogo')
    .getByRole('searchbox')
    .press('Enter')
  await expect(page).toHaveURL(/\/contar\?buscar=fronteira\+%282012%29&nota=/)
  await expect(results(page)).toHaveCount(1)
  await expect(page.getByLabel('Reação: Bruno')).toHaveValue('nota:4,5')
  await expect(page.getByLabel('Comentário: Bruno')).toHaveValue('vale rever')

  await page.getByRole('link', { name: 'Usar Fronteira II (2012)' }).click()
  await expect(
    page.getByLabel('Título ou ID do IMDb', { exact: false }),
  ).toHaveValue('tt9001903')
  await expect(page.getByLabel('Reação: Bruno')).toHaveValue('nota:4,5')
  await expect(page.getByLabel('Comentário: Bruno')).toHaveValue('vale rever')
})

test('Nova Sessão: Enter in the search box searches, opening nothing', async ({
  page,
}) => {
  await loginAsBruno(page)
  await page.goto('/sessoes/nova')
  await page.getByRole('checkbox', { name: 'Iara' }).check()
  await page.getByText('Parecido com um filme?').click()
  await section(page, 'Buscar no Catálogo').getByRole('searchbox').fill('farol')
  await section(page, 'Buscar no Catálogo')
    .getByRole('searchbox')
    .press('Enter')

  await expect(page).toHaveURL(/\/sessoes\/nova\?buscar=farol&nota=/)
  await expect(results(page).first()).toContainText('O Farol de Areia (2012)')
  await expect(page.getByRole('checkbox', { name: 'Iara' })).toBeChecked()
})
