import { type Page } from '@playwright/test'
import { expect, test } from './server-test'

/** Through the app's button to the stand-in Google, as `email`. */
async function loginAs(page: Page, email: string) {
  await page.getByRole('link', { name: 'Entrar com Google' }).click()
  await page.getByLabel('E-mail').fill(email)
  await page.getByRole('button', { name: 'Continuar' }).click()
}

test('a Dono logs in with Google, sees her name in the menu and logs out', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/entrar$/)
  await loginAs(page, 'bruno@example.org')
  await expect(page).toHaveURL(/\/$/)
  await expect(
    page.getByRole('heading', { name: 'O que vai ser hoje?' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Sua conta: Bruno' }),
  ).toBeVisible()

  await page.goto('/entrar')
  await expect(page).toHaveURL(/\/$/)

  await page.getByRole('button', { name: 'Sua conta: Bruno' }).click()
  await page
    .getByRole('navigation', { name: 'Conta' })
    .getByRole('button', { name: 'Sair' })
    .click()
  await expect(page).toHaveURL(/\/entrar$/)
  await page.goto('/')
  await expect(page).toHaveURL(/\/entrar$/)
})

test('an email that is not on a Dono is refused', async ({ page }) => {
  await page.goto('/')
  await loginAs(page, 'iara@example.org')
  await expect(page).toHaveURL(/\/entrar\?recusa=nao-dono$/)
  await expect(page.getByRole('alert')).toContainText(
    'Este e-mail do Google não tem acesso ao filmes.',
  )
  await page.getByRole('link', { name: 'Usar outra conta Google' }).click()
  await page.getByLabel('E-mail').fill('bruno@example.org')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page).toHaveURL(/\/$/)
})

test('a visitor reaches the sources’ credits from the footer', async ({
  page,
}) => {
  await page.goto('/entrar')
  await page
    .getByRole('contentinfo')
    .getByRole('link', { name: 'Créditos das fontes' })
    .click()
  await expect(page).toHaveURL(/\/creditos$/)
  await expect(page.getByRole('heading', { name: 'Créditos' })).toBeVisible()
  for (const source of ['IMDb', 'TMDB', 'Does the Dog Die', 'Trakt'])
    await expect(page.getByRole('link', { name: source })).toBeVisible()
  await expect(
    page.getByText(
      'This product uses the TMDB API but is not endorsed or certified by TMDB.',
    ),
  ).toBeVisible()
})
