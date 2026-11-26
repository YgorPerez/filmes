// Operações for a Dono who is not admin: no link, no page, no form; the
// Catálogo search is for any Dono (#128). Vera, the fixture's second Dona,
// is never admin.

import { type Page } from '@playwright/test'
import { accountMenu, expect, loginAs, tab, test } from './support'

const loginAsVera = (page: Page) => loginAs(page, 'vera@example.org')

test('a Dono who is not admin neither sees nor reaches Operações', async ({
  page,
  baseURL,
}) => {
  await loginAsVera(page)
  await expect(tab(page, 'Meu gosto')).toBeVisible()
  const menu = await accountMenu(page)
  await expect(menu.getByRole('button', { name: 'Sair' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Operações' })).toHaveCount(0)

  const response = await page.goto('/operacoes?sql=SELECT%201')
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'Operações' })).toHaveCount(0)

  const posted = await page.request.post('/operacoes/acao', {
    form: { acao: 'avaliar' },
    headers: { origin: baseURL! },
    maxRedirects: 0,
  })
  expect(posted.status()).toBe(403)
})

test('a Dono who is not admin finds a film by name', async ({ page }) => {
  await loginAsVera(page)
  await page.goto('/pessoas/bruno?buscar=Cidade%20de%20Vidro')

  await expect(
    page.getByRole('region', { name: 'Buscar no Catálogo', exact: true }),
  ).toContainText('tt9000103')
})
