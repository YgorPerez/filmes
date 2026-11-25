// Creating a Pessoa from `/pessoas` (#137) over the build, on the fixture
// copy (never the real filmes-dados). The projects share the copy, so each
// creates her own Pessoa (Luana on desktop, Nina on mobile); only the
// desktop creates a Dono, who then logs in through the stand-in Google.

import { expect, test, type Page } from '@playwright/test'
import { loginAs, loginAsBruno, notice, snap } from './support'

/** Opens "Acrescentar Pessoa" on `/pessoas` and gives its form. */
async function createForm(page: Page) {
  await page.goto('/pessoas')
  await page.getByText('Acrescentar Pessoa', { exact: true }).click()
  return page.getByRole('form', { name: 'Acrescentar Pessoa' })
}

test('the Dono adds a Pessoa, who is a Presente at once', async ({
  page,
}, info) => {
  const [name, slug] =
    info.project.name === 'desktop'
      ? ['Luana Reis', 'luana-reis']
      : ['Nina Costa', 'nina-costa']
  await loginAsBruno(page)

  // A name that is taken comes back refused, with what was typed.
  let form = await createForm(page)
  await snap(page, info, 'pessoas-criar')
  await form.getByLabel('Nome').fill('Iara')
  await form.getByLabel(/^Apelidos/).fill('ia')
  await form.getByRole('button', { name: 'Acrescentar' }).click()
  await expect(page.getByRole('alert')).toContainText('Já existe uma Pessoa')
  form = page.getByRole('form', { name: 'Acrescentar Pessoa' })
  await expect(form.getByLabel('Nome')).toHaveValue('Iara')
  await expect(form.getByLabel(/^Apelidos/)).toHaveValue('ia')
  await snap(page, info, 'pessoas-criar-erro')

  await form.getByLabel('Nome').fill(name)
  await form.getByLabel(/^Apelidos/).fill(name.slice(0, 2))
  await form.getByRole('button', { name: 'Acrescentar' }).click()
  await expect(page).toHaveURL(new RegExp(`/pessoas/${slug}\\?feito=criada$`))
  await expect(page.getByRole('heading', { name })).toBeVisible()
  await expect(notice(page)).toHaveText(
    'Pessoa criada. Conte o gosto dela aqui.',
  )
  await snap(page, info, 'pessoa-criada')

  await page.goto('/sessoes/nova')
  await expect(page.getByRole('checkbox', { name })).toBeVisible()
})

test('the Dono adds a Dono, who logs in with her e-mail', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'the projects share the copy')
  await loginAsBruno(page)
  const form = await createForm(page)
  await form.getByLabel('Nome').fill('Farias')
  await form.getByLabel(/^É Dono/).check()
  await form.getByLabel(/^E-mail do Google/).fill('Farias@Example.org')
  await form.getByRole('button', { name: 'Acrescentar' }).click()
  await expect(page).toHaveURL(/\/pessoas\/farias\?feito=criada$/)

  await page.context().clearCookies()
  await loginAs(page, 'farias@example.org')
  await expect(page.getByRole('heading', { name: 'Olá, Farias' })).toBeVisible()
})
