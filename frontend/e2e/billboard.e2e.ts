// The Cartaz over the build, on the fixture copy (never the real
// filmes-dados), with the sources answering from the recordings. The Dono
// marks films, reloads (the marks come back), sends, and the Session is
// redone: the films that stayed keep their number, the new ones have the
// "novo" mark, and "Saiu" says what left and why. A Já vi writes a Já
// visto in the Pessoa's file, so each project marks a Pessoa of its own
// (the file's other tests read the fixture's Pessoas).
// `E2E_SCREENSHOTS=<folder>` saves each screen.

import {
  copyFileSync,
  cpSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { recommend, recommendSession } from '@filmes/engine'
import { type Page } from '@playwright/test'
import {
  addPerson,
  engineRoot,
  engineRun,
  expect,
  loginAsBruno,
  notice,
  section,
  snap,
  test,
} from './support'

/** Opens a Session for Bruno and `person`, as Bruno; gives its id. */
const openSession = async (person: string, count: number) =>
  (
    await engineRun((engine) =>
      engine.run(recommendSession({ attendees: ['bruno', person], count }), {
        owner: 'bruno',
      }),
    )
  ).session.id

/** `config/weights.toml` of the fixture copy with Bruno's taste neighbours
 * on, written next to it for this project alone; the app keeps the
 * default, where nobody has neighbours. */
const tasteWeights = (project: string) => {
  const root = engineRoot()
  const file = join(root, `weights-taste-${project}.toml`)
  writeFileSync(
    file,
    readFileSync(join(root, 'config/weights.toml'), 'utf8').replace(
      'k = 50\nmin_shared = 10',
      'k = 3\nmin_shared = 5',
    ),
  )
  return { FILMES_PESOS: file }
}

/** Opens a Session for Bruno and `person` with Bruno's taste neighbours
 * on (the fixture's users 10, 20 and 30), so the 5th place is the Aposta
 * (#178), Pequenos Milagres; gives its id. */
const openBetSession = async (person: string, project: string) => {
  const opened = await engineRun(
    (engine) =>
      engine.run(recommendSession({ attendees: ['bruno', person] }), {
        owner: 'bruno',
      }),
    tasteWeights(project),
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

/** The note on keeping the marks shows once the page has hydrated: a click
 * before that is lost when the machine is busy. */
const hydrated = (page: Page) =>
  expect(page.getByText('fica guardado neste navegador')).toBeVisible()

const cards = (page: Page) => page.getByRole('article')
const card = (page: Page, n: number) => cards(page).nth(n - 1)
const titleOf = async (page: Page, n: number) =>
  (await card(page, n).getByRole('heading', { level: 3 }).innerText())
    .replace(/^\d+\s*/, '')
    .split('\n')[0]!
    .trim()

test('the Aposta has its stamp and its section; the films stand under their Motivo, in both themes', async ({
  page,
}, info) => {
  const mobile = info.project.name === 'mobile'
  if (mobile) await page.emulateMedia({ colorScheme: 'dark' })
  const name = mobile ? 'Rui' : 'Pia'
  await addPerson(name)
  const id = await openBetSession(name.toLowerCase(), info.project.name)
  await loginAsBruno(page)
  await page.goto(`/sessoes/${id}`)
  await expect(cards(page)).toHaveCount(5)
  await expect(card(page, 5).getByText('aposta', { exact: true })).toBeVisible()
  for (const n of [1, 2, 3, 4])
    await expect(
      card(page, n).getByText('aposta', { exact: true }),
    ).toHaveCount(0)

  // Only Bruno has Notas: every Motivo is his (#183).
  const sections = page.getByRole('region', { name: /^(Porque você|Aposta)/ })
  const titles = await sections
    .getByRole('heading', { level: 2 })
    .allInnerTexts()
  expect(titles[0]).toMatch(/^Porque você (gosta|gostou) de /)
  expect(titles.at(-1)).toBe('Aposta')
  // Same films, same order: the sections hold the five cards.
  const counts = await Promise.all(
    titles.map((_, i) => sections.nth(i).getByRole('article').count()),
  )
  expect(counts.reduce((a, b) => a + b, 0)).toBe(5)
  await expect(
    section(page, 'Aposta').getByRole('article').getByText('aposta', {
      exact: true,
    }),
  ).toBeVisible()
  await snap(page, info, 'cartaz-secoes')
  await card(page, 5).scrollIntoViewIfNeeded()
  await snap(page, info, 'cartaz-aposta')
})

test('the Aposta’s Motivo explains a higher predicted-rating floor', async ({
  page,
}, info) => {
  const name = info.project.name === 'mobile' ? 'Celia' : 'Dora'
  await addPerson(name)
  // This history belongs only to this recommendation. Other Cartaz tests
  // still start with Bruno's regular history.
  const data = info.outputPath('data')
  cpSync(join(engineRoot(), 'data', 'people'), join(data, 'people'), {
    recursive: true,
  })
  const sessions = join(data, 'sessions')
  mkdirSync(sessions, { recursive: true })
  writeFileSync(
    join(sessions, 'past-bet.md'),
    `---
date: 2026-11-19
owner: bruno
attendees: [bruno]
rule: {name: default}
recommendation: [{position: 5, id: tt9000105, bet: true}]
swapped: [tt9000105]
bet_marks: [{person: bruno, film: tt9000105, kind: swapped, rating: null, date: 2026-11-19}]
---
`,
  )
  const weights = tasteWeights(`cautious-${info.project.name}`).FILMES_PESOS
  writeFileSync(
    weights,
    readFileSync(weights, 'utf8').replace(
      'min_success_rate = 0.25',
      'min_success_rate = 0.0',
    ),
  )
  const {
    session: { id },
  } = await engineRun(
    (engine) =>
      engine.run(
        recommendSession({ attendees: ['bruno', name.toLowerCase()] }),
        {
          owner: 'bruno',
        },
      ),
    { FILMES_DADOS: data, FILMES_PESOS: weights },
  )
  const appSessions = join(engineRoot(), 'data', 'sessions')
  mkdirSync(appSessions, { recursive: true })
  copyFileSync(join(sessions, `${id}.md`), join(appSessions, `${id}.md`))
  await loginAsBruno(page)
  await page.goto(`/sessoes/${id}`)
  await expect(
    section(page, 'Aposta').getByText(
      'O histórico de apostas do grupo pediu uma nota prevista mais alta.',
      { exact: true },
    ),
  ).toBeVisible()
  await snap(page, info, 'cartaz-aposta-cautelosa')
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
  await hydrated(page)
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
  await hydrated(page)
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

// Pequenos Milagres, which Bruno's taste neighbours in the fixture's sample
// rated (#174): with k = 3 and min_shared = 5 they predict 8,3 for him, which the
// Calibration against his own Notas (#210) lifts to 8,8.
const PEQUENOS_MILAGRES = 'tt9000601'

test('the Nota prevista the Session recorded, per Presente who has one', async ({
  page,
}, info) => {
  const vars = tasteWeights(info.project.name)
  const request = { attendees: ['bruno', 'iara'] }
  // A Session long enough to reach Pequenos Milagres; the Aposta (#178) may
  // move it up, so its card is found by the Session's own position.
  const { films } = await engineRun(
    (engine) => engine.run(recommend({ ...request, count: 50 })),
    vars,
  )
  const count = films.find((f) => f.id === PEQUENOS_MILAGRES)?.position ?? 0
  const session = await engineRun(
    (engine) =>
      engine.run(recommendSession({ ...request, count }), { owner: 'bruno' }),
    vars,
  )
  const id = session.session.id
  const at =
    session.films.find((f) => f.id === PEQUENOS_MILAGRES)?.position ?? 0
  await loginAsBruno(page)
  await page.goto(`/sessoes/${id}`)
  await expect(cards(page)).toHaveCount(count)
  await snap(page, info, 'cartaz-nota-prevista')
  await snap(page, info, 'cartaz-nota-prevista-card', card(page, at))

  const predicted = card(page, at).getByRole('list', {
    name: 'Nota prevista',
  })
  await expect(predicted.getByRole('listitem')).toHaveText([/Bruno: 8,8 de 10/])
})
