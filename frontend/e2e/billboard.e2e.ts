// The Cartaz over the build, on the fixture copy (never the real
// filmes-dados), with the sources answering from the recordings. The Dono
// marks films, reloads (the marks come back), sends, and the Session is
// redone: the films that stayed keep their number, the new ones have the
// "novo" mark, and "Saiu" says what left and why. A Já vi writes a Já
// visto in the Pessoa's file, so each project marks a Pessoa of its own
// (the other files read the fixture's Pessoas). `E2E_SCREENSHOTS=<folder>`
// saves each screen.

import { readFileSync, writeFileSync } from 'node:fs'
import { recommendSession } from '@filmes/engine'
import { expect, test, type Page } from '@playwright/test'
import { addPerson, engineRun, loginAsBruno, notice, snap } from './support'

/** Opens a Session for Bruno and `person`, as Bruno; gives its id. */
const openSession = async (person: string, count: number) =>
  (
    await engineRun((engine) =>
      engine.run(recommendSession({ attendees: ['bruno', person], count }), {
        owner: 'bruno',
      }),
    )
  ).session.id

/** Opens a Session for Bruno and `person` with Bruno's taste neighbours
 * on (the fixture's users 10, 20 and 30), so the 5th place is the Aposta
 * (#178); gives its id. */
const openBetSession = async (person: string) => {
  const root = process.env.E2E_ENGINE!
  const weights = `${root}/weights-bet.toml`
  writeFileSync(
    weights,
    readFileSync(`${root}/config/weights.toml`, 'utf8').replace(
      'k = 50\nmin_shared = 10',
      'k = 3\nmin_shared = 5',
    ),
  )
  const opened = await engineRun(
    (engine) =>
      engine.run(recommendSession({ attendees: ['bruno', person] }), {
        owner: 'bruno',
      }),
    { FILMES_PESOS: weights },
  )
  return opened.session.id
}

/** Enviar, and the Session's page saying what it did. */
async function send(page: Page, id: string, done: string, says: string) {
  await page.getByRole('button', { name: 'Enviar' }).click()
  await expect(page).toHaveURL(
    new RegExp(`/sessoes/${id}\\?feito=${done}(&nota=[\\w-]+)?$`),
  )
  await expect(notice(page).first()).toContainText(says)
}

const cards = (page: Page) => page.getByRole('article')
const card = (page: Page, n: number) => cards(page).nth(n - 1)
const titleOf = async (page: Page, n: number) =>
  (await card(page, n).getByRole('heading', { level: 2 }).innerText())
    .replace(/^\d+\s*/, '')
    .split('\n')[0]!
    .trim()

test('the Aposta has its stamp, in both themes', async ({ page }, info) => {
  const mobile = info.project.name === 'mobile'
  if (mobile) await page.emulateMedia({ colorScheme: 'dark' })
  const name = mobile ? 'Rui' : 'Pia'
  await addPerson(name)
  const id = await openBetSession(name.toLowerCase())
  await loginAsBruno(page)
  await page.goto(`/sessoes/${id}`)
  await expect(cards(page)).toHaveCount(5)
  await expect(card(page, 5).getByText('aposta', { exact: true })).toBeVisible()
  for (const n of [1, 2, 3, 4])
    await expect(
      card(page, n).getByText('aposta', { exact: true }),
    ).toHaveCount(0)
  await card(page, 5).scrollIntoViewIfNeeded()
  await snap(page, info, 'cartaz-aposta')
})

test('the Dono marks, reloads, sends, and the Cartaz comes back redone', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'one Pessoa per project')
  await addPerson('Nina')
  const id = await openSession('nina', 4)
  await loginAsBruno(page)
  await page.goto(`/sessoes/${id}`)
  await expect(cards(page)).toHaveCount(4)
  await expect(page.getByText('Vocês dois', { exact: false })).toBeVisible()
  await snap(page, info, 'cartaz')
  const [seen, swapped, third, fourth] = await Promise.all(
    [1, 2, 3, 4].map((n) => titleOf(page, n)),
  )

  // Nothing marked: Enviar says so and stays.
  await page.getByRole('button', { name: 'Enviar' }).click()
  await expect(page.getByText('Nada marcado ainda.')).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/sessoes/${id}$`))

  await card(page, 1).getByRole('button', { name: 'Nina' }).click()
  await page
    .getByRole('group', { name: 'nota de Nina para o filme 1, de 1 a 10' })
    .getByRole('button', { name: '8', exact: true })
    .click()
  await page.getByLabel('o que Nina achou do filme 1').fill('lindo')
  await card(page, 2).getByRole('button', { name: 'Trocar' }).click()
  // The stamp on the poster.
  await expect(
    card(page, 2).getByRole('link').first().getByText('Trocar'),
  ).toBeVisible()
  await card(page, 3).getByRole('button', { name: '4 de 5' }).click()
  await page.getByLabel('comentário sobre o filme 3').fill('longo')
  await expect(page.getByText('1 Trocar marcado · 1 Já vi')).toBeVisible()

  // A reload gives the marks back (one key per Session and version).
  await page.reload()
  await expect(
    card(page, 1).getByRole('button', { name: 'Nina' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('o que Nina achou do filme 1')).toHaveValue(
    'lindo',
  )
  await expect(
    card(page, 2).getByRole('button', { name: 'Trocar' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    card(page, 3).getByRole('button', { name: '4 de 5' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('fica guardado neste navegador')).toBeVisible()
  await snap(page, info, 'cartaz-marcado')

  await send(page, id, 'regerada', 'Recomendação refeita')
  await expect(
    page.getByText(`Saiu da prateleira: ${seen} (Nina já viu)`),
  ).toBeVisible()
  await expect(
    page.getByText(`Saiu da prateleira: ${swapped} (trocado)`),
  ).toBeVisible()
  // The kept films stay at their number; the ones that came in are new.
  expect(await titleOf(page, 3)).toBe(third)
  expect(await titleOf(page, 4)).toBe(fourth)
  for (const n of [1, 2])
    await expect(card(page, n).getByText('novo', { exact: true })).toBeVisible()
  for (const n of [3, 4])
    await expect(card(page, n).getByText('novo', { exact: true })).toHaveCount(
      0,
    )
  // The new version starts with no marks.
  await expect(
    card(page, 2).getByRole('button', { name: 'Trocar' }),
  ).toHaveAttribute('aria-pressed', 'false')
  await snap(page, info, 'cartaz-regerado')
})

test('in the dark, Copiar pro chat gives the text, and stars alone only note', async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'one Pessoa per project')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.emulateMedia({ colorScheme: 'dark' })
  await addPerson('Otto')
  const id = await openSession('otto', 3)
  await loginAsBruno(page)
  await page.goto(`/sessoes/${id}`)
  await expect(cards(page)).toHaveCount(3)
  const film = await card(page, 1)
    .getByRole('link')
    .first()
    .getAttribute('href')
  const imdb = /tt\d+/.exec(film ?? '')?.[0]

  await card(page, 1).getByRole('button', { name: '5 de 5' }).click()
  await page.getByRole('button', { name: 'Copiar pro chat' }).click()
  await expect(page.getByText('Copiado. Cole no chat.')).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `#cartaz ${id} v1\n1 ${imdb} · estrelas: 5\n`,
  )
  await snap(page, info, 'cartaz-escuro')

  await send(page, id, 'anotada', 'Estrelas e comentários')
  await expect(page.getByText('Saiu da prateleira:')).toHaveCount(0)
  await expect(
    card(page, 1).getByRole('button', { name: '5 de 5' }),
  ).toHaveAttribute('aria-pressed', 'false')
  await snap(page, info, 'cartaz-anotado')
})
