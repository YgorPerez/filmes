// Two Donos (#131) over the build, on the fixture copy (never the real
// filmes-dados): Bruno and Vera each log in through the stand-in Google,
// open a Session with Lara (a Pessoa of this file alone), are "Você" on its
// Cartaz, record its Feedback speaking for themselves, and write taste on
// their own page; Bruno tells a Relato about Vera (#138). Only the desktop
// runs it (the projects share the copy).
//
// A Dono who just arrived (#143) sees the home's setup guide. Each project
// logs in as a Dona of its own, created here, since the skip writes to her
// Pessoa file; the skip holds after a reload.
//
// An admin (Bruno, made admin as in `operations.e2e.ts`) gives a Pessoa of
// this file alone her Acesso (#166), she logs in, and once it is taken
// away her next request goes to the login. Only the desktop runs it.

import { consult, personCreate } from '@filmes/engine'
import {
  addPerson,
  engineRun,
  expect,
  loginAs,
  makeBrunoAdmin,
  notice,
  section,
  snap,
  test,
} from './support'

const DONOS = [
  { slug: 'vera', name: 'Vera', other: 'Bruno' },
  { slug: 'bruno', name: 'Bruno', other: 'Vera' },
] as const

/** Each Nota of the Session's Feedback: who, and 1 when it was relayed. */
const ratings = async (session: string) =>
  (
    await engineRun((engine) =>
      engine.run(
        consult(
          `SELECT pessoa, fonte LIKE '%repassado%' AS relayed FROM notas WHERE sessao = '${session}' ORDER BY pessoa`,
        ),
      ),
    )
  ).rows

for (const dono of DONOS)
  test(`${dono.name}, one of two Donos, is the Dono on every screen`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'the projects share the copy')
    await addPerson('Lara')
    await loginAs(page, `${dono.slug}@example.org`)
    await expect(
      page.getByRole('button', { name: `Sua conta: ${dono.name}` }),
    ).toBeVisible()

    // The form checks her, and only her, as the Dono.
    await page.goto('/sessoes/nova')
    await expect(
      page.getByRole('checkbox', { name: new RegExp(`^${dono.name}`) }),
    ).toBeChecked()
    await expect(
      page.getByRole('checkbox', { name: dono.other, exact: true }),
    ).not.toBeChecked()
    await page.getByRole('checkbox', { name: 'Lara' }).check()
    await page.getByText('Mais opções', { exact: true }).click()
    await page.getByLabel('Quantos filmes', { exact: false }).fill('3')
    await page.getByRole('button', { name: 'Recomendar' }).click()
    await expect(page).toHaveURL(
      /\/sessoes\/2026-11-20-lara[^/]*\?feito=aberta$/,
    )
    const id = decodeURIComponent(
      new URL(page.url()).pathname.split('/').at(-1) ?? '',
    )

    // On the Cartaz she is "Você".
    const first = page.getByRole('article').first()
    await expect(first.getByRole('button', { name: 'Você' })).toBeVisible()
    await expect(first.getByRole('button', { name: 'Lara' })).toBeVisible()
    await snap(page, info, `donos-cartaz-${dono.slug}`)

    // The Feedback: her Nota is hers; Lara's she relays.
    await page.goto(`/sessoes/${id}/contar`)
    const own = page.getByLabel(`Reação: ${dono.name}`)
    await expect(own.locator('option[value^="relato:"]')).toHaveCount(0)
    await expect(
      page.getByLabel('Reação: Lara').locator('option[value^="relato:"]'),
    ).not.toHaveCount(0)
    await page.locator('input[name="filme"]').first().check()
    await own.selectOption('nota:5')
    await page.getByLabel('Reação: Lara').selectOption('nota:4')
    await page.getByRole('button', { name: 'Gravar e fechar a Sessão' }).click()
    await expect(page).toHaveURL(new RegExp(`/sessoes/${id}\\?feito=contada$`))
    expect(await ratings(id)).toEqual(
      [
        [dono.slug, 0],
        ['lara', 1],
      ].toSorted(([a], [b]) => String(a).localeCompare(String(b))),
    )

    // Taste on her own page, Meu gosto.
    await page.goto(`/pessoas/${dono.slug}`)
    await expect(page).toHaveURL(/\/meu-gosto$/)
    const area = section(page, 'Declarados')
    await area.getByText('Acrescentar Declarado', { exact: true }).click()
    const form = area.getByRole('form', { name: 'Acrescentar Declarado' })
    await form
      .getByLabel('O que foi dito')
      .fill(`a ${dono.name} gosta de drama`)
    await form.getByRole('button', { name: 'Gravar' }).click()
    await expect(notice(page)).toHaveText('Gravado no arquivo dela.')
    await expect(area).toContainText(`a ${dono.name} gosta de drama`)
  })

test('Bruno tells a Relato about Vera, and Vera sees it on her page', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'the projects share the copy')
  const bruno = await browser.newPage()
  await loginAs(bruno, 'bruno@example.org')

  // On his own page, no Relato form: what he says of himself is Declarado.
  await bruno.goto('/meu-gosto')
  await expect(section(bruno, 'Declarados')).toBeVisible()
  await expect(section(bruno, 'Relatos')).toHaveCount(0)
  await snap(bruno, info, 'relato-bruno-own-page')

  // On Vera's, a Dono too, he tells what he saw her like.
  await bruno.goto('/pessoas/vera')
  const told = section(bruno, 'Relatos')
  await told.getByText('Acrescentar Relato', { exact: true }).click()
  const form = told.getByRole('form', { name: 'Acrescentar Relato' })
  await expect(form).toContainText('descrição de Bruno')
  await snap(bruno, info, 'relato-bruno-on-vera-form')
  await form.getByLabel('O que foi dito').fill('a Vera adora suspense')
  await form.getByRole('button', { name: 'Gravar' }).click()
  await expect(notice(bruno)).toHaveText('Gravado no arquivo dela.')
  await expect(told).toContainText('a Vera adora suspense')
  await bruno.close()

  // Vera sees it on her page, told by Bruno, and cannot add one herself.
  const vera = await browser.newPage()
  await loginAs(vera, 'vera@example.org')
  await vera.goto('/pessoas/vera')
  const hers = section(vera, 'Relatos')
  await expect(hers).toContainText('a Vera adora suspense')
  await expect(hers).toContainText('descrição de Bruno')
  await expect(hers.getByText('Acrescentar Relato')).toHaveCount(0)
  await snap(vera, info, 'relato-vera-own-page')
  await vera.close()
})

const SKIP_IMPORT = 'Pular: Importar do Letterboxd ou do Trakt'

test('a new Dono sees the setup guide, and a skipped step stays skipped', async ({
  page,
}, info) => {
  const email = `nova-${info.project.name}@example.org`
  await engineRun((engine) =>
    engine.run(
      personCreate({ name: `Nova ${info.project.name}`, owner: true, email }),
    ),
  ).catch((error: Error) => {
    if (!error.message.includes('person_exists')) throw error
  })
  await loginAs(page, email)
  const guide = page.getByRole('region', { name: 'Para começar', exact: true })
  await expect(guide).toBeVisible()
  await expect(guide.getByRole('heading', { name: 'Meu gosto' })).toBeVisible()
  await expect(
    guide.getByRole('button', { name: 'Copiar endereço' }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Pedir filme' })).toBeVisible()
  await snap(page, info, 'home-guide')

  await guide.getByRole('button', { name: SKIP_IMPORT }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.reload()
  await expect(guide.getByText('Retomar')).toBeVisible()
  await expect(guide.getByRole('button', { name: SKIP_IMPORT })).toHaveCount(0)
  await snap(page, info, 'home-guide-skipped')

  // Every step out of the way: the guide leaves, "pedir filme" stays.
  await guide.getByRole('button', { name: 'Pular: Meu gosto' }).click()
  await expect(guide.getByText(/^http:\/\/localhost:\d+\/mcp$/)).toBeVisible()
  await guide.getByRole('button', { name: 'Pular: Conector no Claude' }).click()
  await expect(guide).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Pedir filme' })).toBeVisible()
  await snap(page, info, 'home-set-up')
})

test('the admin gives a Pessoa access and takes it away', async ({
  browser,
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'the projects share the copy')
  makeBrunoAdmin()
  await addPerson('Odete')
  await loginAs(page, 'bruno@example.org')
  await page.goto('/pessoas/odete')
  const access = section(page, 'Acesso')
  await expect(access).toContainText('Sem acesso.')
  await snap(page, info, 'access-none')
  await access.getByLabel('E-mail do Google').fill('odete@example.org')
  await access.getByRole('button', { name: 'Dar acesso' }).click()
  await expect(notice(page)).toContainText('Acesso dado')
  await expect(access).toContainText('Entra com odete@example.org.')
  await snap(page, info, 'access-owner')

  const odete = await browser.newPage()
  await loginAs(odete, 'odete@example.org')

  await access.getByRole('button', { name: 'Tirar acesso' }).click()
  await expect(notice(page)).toContainText('Acesso tirado')
  await expect(access).toContainText('Sem acesso.')

  await odete.goto('/pessoas')
  await expect(odete).toHaveURL(/\/entrar/)
  await odete.close()
})

test("the admin's own page offers no way out", async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the projects share the copy')
  makeBrunoAdmin()
  await loginAs(page, 'bruno@example.org')
  await page.goto('/pessoas/bruno')
  const access = section(page, 'Acesso')
  await expect(access).toContainText('o seu próprio acesso não sai por aqui')
  await expect(access.getByRole('button')).toHaveCount(0)
})

test('a Dono who is not admin sees no Acesso', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the projects share the copy')
  await addPerson('Odete')
  await loginAs(page, 'vera@example.org')
  await page.goto('/pessoas/odete')
  await expect(page.getByRole('heading', { name: 'Odete' })).toBeVisible()
  await expect(section(page, 'Acesso')).toHaveCount(0)
  await snap(page, info, 'access-not-admin')
})
