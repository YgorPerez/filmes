// The Sessions screens over the build, on the fixture copy (never the real
// filmes-dados): the Dono asks for a Session with the form, sees its
// Recomendação, finds it among the open Sessions with the way to its
// Feedback. The two projects share the copy, so each opens Sessions for its
// own group (desktop: Bruno and Iara; mobile: Bruno and Quim) and reads the
// id from the page it lands on. `E2E_SCREENSHOTS=<folder>` saves a capture
// of each screen.

import { listSessions, recommendSession, recordFeedback } from '@filmes/engine'
import { expect, test, type Page } from '@playwright/test'
import { engineRun, loginAs, loginAsBruno, section, snap } from './support'

const ask = (page: Page) =>
  page.getByRole('button', { name: 'Recomendar' }).click()

/** The id of the Session whose page is open. */
const openedId = (page: Page) =>
  decodeURIComponent(new URL(page.url()).pathname.split('/').at(-1) ?? '')

const sessionFile = async (id: string) =>
  (await engineRun((engine) => engine.run(listSessions))).sessions.find(
    (s) => s.id === id,
  )

test('the Dono opens a Session with Restrições and finds it in the list', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'one group per project')
  await loginAsBruno(page)
  await snap(page, info, 'inicio')
  await page
    .getByRole('navigation', { name: 'Telas' })
    .getByRole('link', { name: /^Sessões/ })
    .click()
  await expect(page).toHaveURL(/\/sessoes$/)
  await snap(page, info, 'sessoes-lista')

  await page.getByRole('link', { name: 'Nova Sessão' }).click()
  await expect(page).toHaveURL(/\/sessoes\/nova$/)
  await expect(page.getByRole('checkbox', { name: /Bruno/ })).toBeChecked()
  await page.getByRole('checkbox', { name: 'Iara' }).check()
  await page.getByRole('checkbox', { name: 'leve' }).check()
  await page.getByLabel('Quantos filmes', { exact: false }).fill('3')
  await page.getByLabel('Em uma frase', { exact: false }).fill('eu e a Iara')
  await page.getByLabel('Duração máxima', { exact: false }).fill('130')
  await page.getByLabel('Criança').selectOption('7')
  await page.getByRole('checkbox', { name: 'Nada lento' }).check()
  await snap(page, info, 'sessoes-nova')
  await ask(page)

  await expect(page).toHaveURL(/\/sessoes\/2026-11-20-iara[^/]*\?feito=aberta$/)
  const id = openedId(page)
  await expect(page.getByRole('status')).toContainText('Sessão aberta')
  await expect(
    page.getByRole('img', { name: /até 2h10 · .*com criança de 7 anos/ }),
  ).toBeVisible()
  const films = page.getByRole('article')
  await expect(films.first()).toBeVisible()
  expect(await films.count()).toBeLessThanOrEqual(3)
  await snap(page, info, 'sessoes-aberta')

  // The engine wrote what the form asked.
  const written = await sessionFile(id)
  expect(written).toMatchObject({
    open: true,
    attendees: ['bruno', 'iara'],
    request: 'eu e a Iara',
    moods: ['leve'],
    constraints: ['até 2h10', 'com criança de 7 anos', 'nada lento'],
  })

  await page.getByRole('link', { name: 'Voltar' }).click()
  const row = section(page, 'Abertas')
    .getByRole('listitem')
    .filter({
      has: page.locator(`a[href="/sessoes/${id}"]`),
    })
  await expect(row).toContainText('eu e a Iara')
  await expect(
    row.getByRole('link', { name: `Contar como foi a Sessão ${id}` }),
  ).toHaveAttribute('href', `/feedback/${id}`)
  await snap(page, info, 'sessoes-lista-com-sessao')
})

test('“Ler” fills the form from one sentence and says what it left out', async ({
  page,
}, info) => {
  // Reads only, so both projects run it: no Session is opened.
  await loginAsBruno(page)
  await page.goto('/sessoes/nova')
  await snap(page, info, 'sessoes-nova-frase-vazia')

  // "Ler" with no sentence: the page says so.
  await page.getByRole('button', { name: 'Ler' }).click()
  await expect(page).toHaveURL(/\/sessoes\/nova\?erro=frase$/)
  await expect(page.getByRole('alert')).toContainText('Escreva a frase')

  const sentence =
    'eu e a Iara, algo leve, até 2h, tem criança de 7, nada lento, parecido com Reprise, com pipoca'
  await page.getByLabel('Em uma frase', { exact: false }).fill(sentence)
  await page.getByRole('button', { name: 'Ler' }).click()
  await expect(page).toHaveURL(/\/sessoes\/nova\?frase=/)

  await expect(page.getByLabel('Em uma frase', { exact: false })).toHaveValue(
    sentence,
  )
  await expect(page.getByRole('checkbox', { name: /Bruno/ })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Iara' })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'leve' })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Nada lento' })).toBeChecked()
  await expect(page.getByLabel('Duração máxima', { exact: false })).toHaveValue(
    '120',
  )
  await expect(page.getByLabel('Criança')).toHaveValue('7')
  const said = page.getByRole('status')
  await expect(said).toContainText('Lido da frase: Presente: Bruno')
  await expect(said).toContainText('Ficou de fora: “pipoca”')
  await expect(said).toContainText(
    '“Reprise” pode ser Reprise (2011) ou Reprise (2004)',
  )
  await snap(page, info, 'sessoes-nova-frase-lida')
})

test('the form says why it refused, and “o gosto de uma Pessoa” orders', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'one group per project')
  await loginAsBruno(page)
  await page.goto('/sessoes/nova')

  // No Presente: the page refuses before the engine.
  await page.getByRole('checkbox', { name: /Bruno/ }).uncheck()
  await ask(page)
  await expect(page).toHaveURL(/\/sessoes\/nova\?erro=presentes$/)
  await expect(page.getByRole('alert')).toContainText(
    'Marque pelo menos um Presente',
  )
  await snap(page, info, 'sessoes-recusa')

  // A film the Catálogo does not have: the engine refuses.
  await page.getByLabel('Parecido com', { exact: false }).fill('tt0000001')
  await ask(page)
  await expect(page).toHaveURL(/\/sessoes\/nova\?erro=parecido$/)

  await page.getByRole('checkbox', { name: 'Quim' }).check()
  await page.getByRole('radio', { name: 'O gosto de uma Pessoa' }).check()
  await page.getByRole('combobox', { name: /^De quem/ }).selectOption('quim')
  await ask(page)
  await expect(page).toHaveURL(/\/sessoes\/2026-11-20-quim[^/]*\?feito=aberta$/)
  const id = openedId(page)
  expect((await sessionFile(id))?.attendees).toEqual(['bruno', 'quim'])
  await snap(page, info, 'sessoes-aberta')
})

// The Link da Sessão (#180): the Dono shares it, a Presente with no login
// picks who she is and sees the current films, until the Feedback.

test('the Dono shares the current films with a Presente who has no login', async ({
  page,
  browser,
}, info) => {
  const person = info.project.name === 'desktop' ? 'rosa' : 'quim'
  const name = info.project.name === 'desktop' ? 'Rosa' : 'Quim'
  const opened = await engineRun((engine) =>
    engine.run(
      recommendSession({
        attendees: ['dono', person],
        count: 3,
        request: 'Pedido particular da Sessão',
      }),
      { owner: 'bruno' },
    ),
  )
  await loginAsBruno(page)
  const ownerPage = await page.goto(`/sessoes/${opened.session.id}`)
  expect(ownerPage?.headers()['cache-control']).toContain('no-store')
  const link = page.getByRole('link', { name: 'Link para os Presentes' })
  await expect(link).toBeVisible()
  await snap(page, info, 'sessao-link')
  const href = new URL((await link.getAttribute('href')) ?? '', page.url())
  const guest = await browser.newContext()
  try {
    const participant = await guest.newPage()
    const response = await participant.goto(href.href)
    expect(response?.headers()).toMatchObject({
      'cache-control': 'private, no-store',
      'referrer-policy': 'no-referrer',
      'x-robots-tag': 'noindex',
    })
    await expect(
      participant.getByRole('heading', { name: 'Quem é você?' }),
    ).toBeVisible()
    await expect(participant.getByRole('link', { name: 'Bruno' })).toBeVisible()
    await expect(participant.getByRole('link', { name: 'Iara' })).toHaveCount(0)
    await snap(participant, info, 'sessao-escolher-presente')
    const choice = participant.getByRole('link', { name, exact: true })
    const selected = new URL((await choice.getAttribute('href')) ?? '', href)
    const selectedPage = await participant.goto(selected.href)
    const films = participant.getByRole('list', { name: 'Filmes da Sessão' })
    await expect(films.getByRole('listitem')).toHaveText(
      opened.films.map((film) => film.title),
    )
    expect(await selectedPage?.text()).not.toMatch(
      /Pedido particular da Sessão|@example\.org|"evidence"|"utility"/u,
    )
    await snap(participant, info, 'sessao-filmes-presentes')
    await expect(
      participant.getByRole('button', { name: 'Enviar' }),
    ).toHaveCount(0)
  } finally {
    await guest.close()
  }
})

test('the link only works for its Session while it is open', async ({
  page,
  browser,
}, info) => {
  test.skip(
    info.project.name !== 'desktop',
    'the capability is device-independent',
  )
  const open = async (person: string) =>
    (
      await engineRun((engine) =>
        engine.run(recommendSession({ attendees: ['dono', person] }), {
          owner: 'bruno',
        }),
      )
    ).session.id
  const session = await open('teo')
  const other = await open('iara')
  const path = `/sessoes/${session}`
  await loginAsBruno(page)
  await page.goto(path)
  const share = page.getByRole('link', { name: 'Link para os Presentes' })
  const shared = await share.getAttribute('href')
  if (!shared) throw new Error('the Session had no link')
  await page.reload()
  await expect(share).toHaveAttribute('href', shared)

  const guest = await browser.newContext()
  try {
    const participant = await guest.newPage()
    const unavailable = participant.getByRole('heading', {
      name: 'Link da Sessão indisponível',
    })
    const href = new URL(shared)
    href.searchParams.set('presente', 'iara')
    await participant.goto(href.href)
    await expect(
      participant.getByRole('heading', { name: 'Quem é você?' }),
    ).toBeVisible()
    await expect(
      participant.getByRole('list', { name: 'Filmes da Sessão' }),
    ).toHaveCount(0)

    href.searchParams.set('sessao', other)
    await participant.goto(href.href)
    await expect(unavailable).toBeVisible()

    href.searchParams.set('sessao', session)
    href.searchParams.delete('chave')
    await participant.goto(href.href)
    await expect(unavailable).toBeVisible()

    // Another site's Dono can see the normal Cartaz, but cannot issue its link.
    await loginAs(await guest.newPage(), 'vera@example.org')
    await participant.goto(new URL(path, shared).href)
    await expect(
      participant.getByRole('heading', { name: /Sessão 2026-11-20/ }),
    ).toBeVisible()
    await expect(
      participant.getByRole('link', { name: 'Link para os Presentes' }),
    ).toHaveCount(0)

    await engineRun((engine) =>
      engine.run(recordFeedback({ session, film: null }), { owner: 'bruno' }),
    )
    await page.reload()
    await expect(share).toHaveCount(0)
    await participant.goto(shared)
    await expect(unavailable).toBeVisible()
    await snap(participant, info, 'sessao-link-encerrado')
  } finally {
    await guest.close()
  }
})

// The Perguntas par a par (#181): through the link, a Presente says which of
// two films she liked more; the answers wait on the Session's page until
// the Dono records them.

test('a Presente answers pairwise questions and the Dono records them', async ({
  page,
  browser,
}, info) => {
  const person = info.project.name === 'desktop' ? 'teo' : 'iara'
  const name = info.project.name === 'desktop' ? 'Teo' : 'Iara'
  const opened = await engineRun((engine) =>
    engine.run(recommendSession({ attendees: ['dono', person], count: 2 }), {
      owner: 'bruno',
    }),
  )
  const path = `/sessoes/${opened.session.id}`
  await loginAsBruno(page)
  await page.goto(path)
  const shared = await page
    .getByRole('link', { name: 'Link para os Presentes' })
    .getAttribute('href')
  if (!shared) throw new Error('the Session had no link')
  const href = new URL(shared)
  href.searchParams.set('presente', person)

  const guest = await browser.newContext()
  try {
    const participant = await guest.newPage()
    await participant.goto(href.href)
    await participant
      .getByRole('link', { name: 'Responder perguntas de gosto' })
      .click()
    const question = participant.getByRole('form', {
      name: 'Qual dos dois você gostou mais?',
    })
    await expect(question).toContainText('Pergunta 1 de 10')
    await snap(participant, info, 'perguntas-par-a-par')
    const [chosen, other] = await question
      .getByRole('button')
      .evaluateAll((buttons) => buttons.map((b) => b.textContent ?? ''))
    await question.getByRole('button', { name: chosen }).click()
    await expect(question).toContainText('Pergunta 2 de 10')
    await question.getByRole('button', { name: 'Não vi os dois' }).click()
    await expect(question).toContainText('Pergunta 3 de 10')

    await page.reload()
    const answers = page.getByRole('form', { name })
    await expect(answers.getByRole('listitem')).toHaveText([
      `Preferiu ${chosen} a ${other}`,
    ])
    await snap(page, info, 'sessao-perguntas-dono')
    await answers
      .getByRole('button', { name: `Gravar as respostas de ${name}` })
      .click()
    await expect(page).toHaveURL(/\?feito=perguntas-gravadas$/)
    await expect(page.getByRole('status').first()).toContainText(
      'Respostas gravadas',
    )
    await expect(page.getByRole('form', { name })).toHaveCount(0)
  } finally {
    await guest.close()
  }
})

test('each Presente votes on the films; a no swaps the film and the Session is redone', async ({
  page,
  browser,
}, info) => {
  const person = info.project.name === 'desktop' ? 'rosa' : 'quim'
  const name = info.project.name === 'desktop' ? 'Rosa' : 'Quim'
  const opened = await engineRun((engine) =>
    engine.run(recommendSession({ attendees: ['dono', person], count: 3 }), {
      owner: 'bruno',
    }),
  )
  const [first, second, third] = opened.films.map((film) => film.title)
  await loginAsBruno(page)
  await page.goto(`/sessoes/${opened.session.id}`)
  const shared = await page
    .getByRole('link', { name: 'Link para os Presentes' })
    .getAttribute('href')
  if (!shared) throw new Error('the Session had no link')
  const guest = await browser.newContext()
  try {
    const participant = await guest.newPage()
    const href = new URL(shared)
    href.searchParams.set('presente', person)
    await participant.goto(href.href)
    await expect(participant.getByText(name, { exact: true })).toBeVisible()
    await participant.getByRole('link', { name: 'Votar nos filmes' }).click()
    await expect(
      participant.getByRole('heading', { name: first }),
    ).toBeVisible()
    await snap(participant, info, 'sessao-votar')

    await participant.getByRole('button', { name: 'Sim', exact: true }).click()
    await expect(
      participant.getByRole('heading', { name: second }),
    ).toBeVisible()
    await participant.getByRole('button', { name: 'Não', exact: true }).click()
    await participant.getByRole('button', { name: 'Sim', exact: true }).click()
    await expect(participant.getByText('2 sins · 1 não')).toBeVisible()
    await snap(participant, info, 'sessao-votos-resumo')

    await participant.getByRole('button', { name: 'Enviar votos' }).click()
    await expect(participant.getByRole('status')).toContainText(
      'outro entrou no lugar',
    )
    // Only the film that came in is left to vote on.
    const newcomer = participant.getByRole('article')
    await expect(newcomer).toHaveCount(1)
    await expect(newcomer).not.toContainText(second ?? '')
    await expect(participant.getByText('Filme 1 de 1')).toBeVisible()
    await snap(participant, info, 'sessao-votos-enviados')

    await page.reload()
    await expect(page.getByText(/Saiu da prateleira/u)).toBeVisible()
    const onCartaz = (title?: string) =>
      page.getByRole('heading', { level: 2 }).filter({ hasText: title })
    await expect(onCartaz(second)).toHaveCount(0)
    await expect(onCartaz(first)).toHaveCount(1)
    await expect(onCartaz(third)).toHaveCount(1)
    await snap(page, info, 'sessao-cartaz-depois-dos-votos')
  } finally {
    await guest.close()
  }
})
