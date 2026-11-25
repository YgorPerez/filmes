// Operações for a Dono who is not admin: no link, no page, no form. Its own
// project, run before the others (`playwright.config.ts`): after it,
// `operations.e2e.ts` makes Bruno admin on the copy.

import { expect, test } from '@playwright/test'
import { loginAsBruno } from './support'

test('a Dono who is not admin neither sees nor reaches Operações', async ({
  page,
  baseURL,
}) => {
  await loginAsBruno(page)
  await expect(page.getByRole('link', { name: 'Feedback' })).toBeVisible()
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
