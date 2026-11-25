// Two Donos (#131) over the build, on the fixture copy (never the real
// filmes-dados): Bruno and Vera each log in through the stand-in Google,
// open a Session with Lara (a Pessoa of this file alone), are "Você" on its
// Cartaz, record its Feedback speaking for themselves, and write taste on
// their own page. Only the desktop runs it (the projects share the copy).

import { consult } from '@filmes/engine'
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
