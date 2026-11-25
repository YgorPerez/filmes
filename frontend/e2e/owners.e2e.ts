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

import { consult, personCreate } from '@filmes/engine'
import { expect, test } from '@playwright/test'
import { addPerson, engineRun, loginAs, notice, section, snap } from './support'

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
      page.getByRole('heading', { name: `Olá, ${dono.name}` }),
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
    await expect(first.getByRole('checkbox', { name: 'Você' })).toBeVisible()
    await expect(first.getByRole('checkbox', { name: 'Lara' })).toBeVisible()
    await snap(page, info, `donos-cartaz-${dono.slug}`)

    // The Feedback: her Nota is hers; Lara's she relays.
    await page.goto(`/feedback/${id}`)
    const own = page.getByLabel(`Reação: ${dono.name}`)
    await expect(own.locator('option[value^="relato:"]')).toHaveCount(0)
    await expect(
      page.getByLabel('Reação: Lara').locator('option[value^="relato:"]'),
    ).not.toHaveCount(0)
    await page.locator('input[name="filme"]').first().check()
    await own.selectOption('nota:5')
    await page.getByLabel('Reação: Lara').selectOption('nota:4')
    await page.getByRole('button', { name: 'Gravar e fechar a Sessão' }).click()
    await expect(page).toHaveURL(new RegExp(`/feedback\\?feito=${id}$`))
    expect(await ratings(id)).toEqual(
      [
        [dono.slug, 0],
        ['lara', 1],
      ].toSorted(([a], [b]) => String(a).localeCompare(String(b))),
    )

    // Taste on her own page.
    await page.goto(`/pessoas/${dono.slug}`)
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
  await bruno.goto('/pessoas/bruno')
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
  const guide = section(page, 'Para começar')
  await expect(guide).toBeVisible()
  await expect(guide.getByRole('heading', { name: 'Meu gosto' })).toBeVisible()
  await expect(guide.getByText(/^http:\/\/localhost:\d+\/mcp$/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Pedir filme' })).toBeVisible()
  await snap(page, info, 'home-guide')

  await guide.getByRole('button', { name: SKIP_IMPORT }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.reload()
  await expect(guide.getByText('Pulado')).toBeVisible()
  await expect(guide.getByRole('button', { name: SKIP_IMPORT })).toHaveCount(0)
  await snap(page, info, 'home-guide-skipped')

  // Every step out of the way: the guide leaves, "pedir filme" stays.
  await guide.getByRole('button', { name: 'Pular: Meu gosto' }).click()
  await guide.getByRole('button', { name: 'Pular: Conector no Claude' }).click()
  await expect(guide).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Pedir filme' })).toBeVisible()
  await snap(page, info, 'home-set-up')
})
