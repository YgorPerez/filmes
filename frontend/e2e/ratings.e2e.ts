// The rating screen (#144), over the build and on the fixture copy: a new
// Dona with no history gives Notas from her Fila and from the search, passes
// a film over, and Pronto writes them to her file in one go. Each project
// has its own Dona, so the other files never see her Notas.
// `E2E_SCREENSHOTS=<folder>` saves a capture of the screen.

import { personCreate, personView } from '@filmes/engine'
import { expect, test } from '@playwright/test'
import { engineRun, loginAs, notice, section, snap } from './support'

test('a Dona with no history rates from the Fila and the search, then Pronto', async ({
  page,
}, info) => {
  const slug = `nina-${info.project.name}`
  const email = `${slug}@example.org`
  await engineRun((engine) =>
    engine.run(
      personCreate({ name: `Nina ${info.project.name}`, owner: true, email }),
    ),
  ).catch((error: Error) => {
    if (!/taken|exists/.test(error.message)) throw error
  })
  await loginAs(page, email)
  await page.goto('/notas')

  const card = page.getByRole('article', { name: 'Filme para dar Nota' })
  await expect(card.getByRole('heading')).toHaveText('Pequenos Milagres')
  await snap(page, info, 'notas')
  await card.getByRole('button', { name: 'Nota 8' }).click()
  await expect(card.getByRole('heading')).toHaveText('Casa Cheia')
  await card.getByRole('button', { name: 'Não vi' }).click()
  await expect(card.getByRole('heading')).not.toHaveText('Casa Cheia')

  const search = section(page, 'Buscar no Catálogo')
  await search.getByRole('searchbox').fill('fronteira')
  await search.getByRole('button', { name: 'Buscar' }).click()
  await page.getByRole('link', { name: 'Usar Fronteira (2008)' }).click()
  await expect(card.getByRole('heading')).toHaveText('Fronteira')
  await card.getByRole('button', { name: 'Nota 6' }).click()

  const mine = section(page, 'Suas Notas')
  await expect(mine.getByRole('listitem')).toHaveCount(2)
  await snap(page, info, 'notas-rascunho')
  await mine.getByRole('button', { name: 'Pronto (2 Notas)' }).click()

  await expect(notice(page)).toHaveText('2 Notas gravadas no seu gosto.')
  await expect(mine.getByRole('listitem')).toHaveCount(0)
  await expect(card.getByRole('heading')).not.toHaveText('Pequenos Milagres')
  const view = await engineRun((engine) => engine.run(personView(slug)))
  expect((view.ratings ?? []).map((r) => [r.filmId, r.rating]).sort()).toEqual([
    ['tt9000401', 3],
    ['tt9000601', 4],
  ])
})
