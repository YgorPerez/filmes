import { type Page } from '@playwright/test'
import { expect, test } from './server-test'

/** Through the app's button to the stand-in Google, as `email`. */
async function loginAs(page: Page, email: string) {
  await page.goto('/')
  await expect(page).toHaveURL(/\/entrar$/)
  await page.getByRole('link', { name: 'Entrar com Google' }).click()
  await page.getByLabel('E-mail').fill(email)
  await page.getByRole('button', { name: 'Continuar' }).click()
}

test('a Dono logs in with Google, sees her name and logs out', async ({
  page,
}) => {
  await loginAs(page, 'bruno@example.org')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Olá, Bruno' })).toBeVisible()

  await page.goto('/entrar')
  await expect(page).toHaveURL(/\/$/)

  await page.getByRole('button', { name: 'Sair' }).click()
  await expect(page).toHaveURL(/\/entrar$/)
  await page.goto('/')
  await expect(page).toHaveURL(/\/entrar$/)
})

test('an email that is not on a Dono is refused', async ({ page }) => {
  await loginAs(page, 'iara@example.org')
  await expect(page).toHaveURL(/\/entrar\?recusa=nao-dono$/)
  await expect(page.getByRole('alert')).toContainText(
    'não é de um Dono do filmes',
  )
  await page.goto('/')
  await expect(page).toHaveURL(/\/entrar$/)
})
