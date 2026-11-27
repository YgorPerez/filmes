// The Sessions screens over the build, on the fixture copy (never the real
// filmes-dados): the Dono asks for a Session with the form, sees its
// Recomendação, finds it among the open Sessions with the way to its
// Feedback. The two projects share the copy, so each opens Sessions for its
// own group (desktop: Bruno and Iara; mobile: Bruno and Quim) and reads the
// id from the page it lands on. `E2E_SCREENSHOTS=<folder>` saves a capture
// of each screen.

import {
  castVotes,
  listSessions,
  recommendSession,
  recordFeedback,
} from '@filmes/engine'
import {
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test'
import {
  tab,
  engineRun,
  expect,
  loginAs,
  loginAsBruno,
  notice,
  snap,
  test,
} from './support'

const ask = (page: Page) =>
  page.getByRole('button', { name: 'Recomendar' }).click()

/** The id of the Session whose page is open. */
const openedId = (page: Page) =>
  decodeURIComponent(new URL(page.url()).pathname.split('/').at(-1) ?? '')

const sessionFile = async (id: string) =>
  (await engineRun((engine) => engine.run(listSessions))).sessions.find(
    (s) => s.id === id,
  )

/** The Link para os Presentes sits in the head's ⋯ menu (#272). */
const openMenu = (page: Page) => page.getByLabel('Mais ações da Sessão').click()

const sessionLinkFor = async (page: Page, person: string) => {
  await openMenu(page)
  const shared = await page
    .getByRole('link', { name: 'Link para os Presentes' })
    .getAttribute('href')
  if (!shared) throw new Error('the Session had no link')
  const href = new URL(shared)
  href.searchParams.set('presente', person)
  return href.href
}

/** The open Session `id` in the list, with the way to its Feedback. */
async function findInList(page: Page, info: TestInfo, id: string) {
  await tab(page, 'Sessões').click()
  const row = page
    .getByRole('list', { name: 'Sessões' })
    .getByRole('listitem')
    .filter({
      has: page.locator(`a[href="/sessoes/${id}"]`),
    })
  await expect(row).toContainText('eu e a Iara')
  await expect(
    row.getByRole('link', { name: 'Contar como foi' }),
  ).toHaveAttribute('href', `/sessoes/${id}/contar`)
  await snap(page, info, 'sessoes-lista-com-sessao')
}

test('the Dono opens a Session with Restrições and finds it in the list', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'one group per project')
  await loginAsBruno(page)
  await snap(page, info, 'inicio')
  await tab(page, 'Sessões').click()
  await expect(page).toHaveURL(/\/sessoes$/)
  await snap(page, info, 'sessoes-lista')

  await page.getByRole('link', { name: 'Nova Sessão' }).click()
  await expect(page).toHaveURL(/\/sessoes\/nova$/)
  await expect(page.getByRole('checkbox', { name: /Bruno/ })).toBeChecked()
  await page.getByRole('checkbox', { name: 'Iara' }).check()
  await page.getByRole('checkbox', { name: 'leve', exact: true }).check()
  await page.getByText('Mais opções', { exact: true }).click()
  await page.getByLabel('Quantos filmes', { exact: false }).fill('3')
  await page.getByLabel('Em uma frase', { exact: false }).fill('eu e a Iara')
  await page.getByLabel('Duração máxima', { exact: false }).fill('130')
  await page.getByLabel('Criança').selectOption('7')
  await page.getByRole('checkbox', { name: 'Nada lento' }).check()
  await snap(page, info, 'sessoes-nova')
  await ask(page)

  await expect(page).toHaveURL(/\/sessoes\/2026-11-20-iara[^/]*\?feito=aberta$/)
  const id = openedId(page)
  // A new Session opens on its Cartaz, with no notice above it (#272).
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Sex, 20 nov',
  )
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

  await findInList(page, info, id)
})

test('“Ler” fills the form from one sentence and says what it left out', async ({
  page,
}, info) => {
  // Reads only, so both projects run it: no Session is opened.
  await loginAsBruno(page)
  await page.goto('/sessoes/nova')
  await snap(page, info, 'sessoes-nova-frase-vazia')

  // "Ler" with no sentence: the page says so, in place (#235).
  await page.getByRole('button', { name: 'Ler' }).click()
  await expect(page.getByRole('alert')).toContainText('Escreva a frase')
  await expect(page).toHaveURL(/\/sessoes\/nova$/)

  // What the Dono set before "Ler" stays: the reading fills on top.
  await page.getByRole('checkbox', { name: 'pra rir', exact: true }).check()
  const sentence =
    'eu e a Iara, algo leve, até 2h, tem criança de 7, nada lento, parecido com Reprise, com pipoca'
  await page.getByLabel('Em uma frase', { exact: false }).fill(sentence)
  await page.getByRole('button', { name: 'Ler' }).click()
  // The sentence travels in a note, never in the URL.
  await expect(page).toHaveURL(/\/sessoes\/nova\?nota=[\w-]+$/)

  await expect(page.getByLabel('Em uma frase', { exact: false })).toHaveValue(
    sentence,
  )
  await expect(page.getByRole('checkbox', { name: /Bruno/ })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Iara' })).toBeChecked()
  await expect(
    page.getByRole('checkbox', { name: 'pra rir', exact: true }),
  ).toBeChecked()
  await expect(
    page.getByRole('checkbox', { name: 'leve', exact: true }),
  ).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Nada lento' })).toBeChecked()
  await expect(page.getByLabel('Duração máxima', { exact: false })).toHaveValue(
    '120',
  )
  await expect(page.getByLabel('Criança')).toHaveValue('7')
  const said = page.getByRole('status')
  await expect(said).toContainText('Entendi: você, Iara')
  await expect(said).toContainText('Deixei “pipoca” de fora')
  await expect(
    page.getByText('Qual destes filmes você quis dizer com “Reprise”?'),
  ).toBeVisible()
  await snap(page, info, 'sessoes-nova-frase-lida')

  // "Usar" on one of the films takes it for "Parecido com" in place, and
  // the form keeps what "Ler" filled.
  await page.getByRole('button', { name: 'Usar Reprise (2004)' }).click()
  await expect(
    page.getByRole('button', { name: 'Tirar Reprise (2004)' }),
  ).toBeVisible()
  await expect(page).toHaveURL(/\/sessoes\/nova\?nota=[\w-]+$/)
  await snap(page, info, 'sessoes-nova-parecido')
  await expect(
    page.getByRole('checkbox', { name: 'pra rir', exact: true }),
  ).toBeChecked()
  await expect(page.getByLabel('Criança')).toHaveValue('7')
})

test('the form says why it refused, and “o gosto de uma Pessoa” orders', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'one group per project')
  await loginAsBruno(page)
  await page.goto('/sessoes/nova')

  // No Presente: the page refuses before the engine, in place, with the
  // form as it was (#235).
  await page.getByRole('checkbox', { name: /Bruno/ }).uncheck()
  await ask(page)
  await expect(page.getByRole('alert')).toContainText(
    'Marque pelo menos um Presente',
  )
  await expect(page).toHaveURL(/\/sessoes\/nova$/)
  await expect(page.getByRole('checkbox', { name: /Bruno/ })).not.toBeChecked()
  await snap(page, info, 'sessoes-recusa')

  // A film the Catálogo does not have (from a link): the engine refuses.
  await page.goto('/sessoes/nova?parecido=tt0000001')
  await ask(page)
  await expect(page.getByRole('alert')).toContainText('Parecido com')
  await page.getByRole('button', { name: 'Tirar tt0000001' }).click()

  await page.getByRole('checkbox', { name: 'Quim' }).check()
  await page.getByText('Mais opções', { exact: true }).click()
  await page.getByRole('radio', { name: 'O gosto de uma Pessoa' }).check()
  await page.getByRole('combobox', { name: /^De quem/ }).selectOption('quim')
  await ask(page)
  await expect(page).toHaveURL(/\/sessoes\/2026-11-20-quim[^/]*\?feito=aberta$/)
  const id = openedId(page)
  expect((await sessionFile(id))?.attendees).toEqual(['bruno', 'quim'])
  await snap(page, info, 'sessoes-aberta')
})

/** Each project's Presente of its own, slug and name. */
const guestOf = (info: TestInfo) =>
  info.project.name === 'desktop'
    ? { person: 'rosa', name: 'Rosa' }
    : { person: 'quim', name: 'Quim' }

/** Opens a Session as Bruno, through the engine. */
const openAsBruno = (request: Parameters<typeof recommendSession>[0]) =>
  engineRun((engine) =>
    engine.run(recommendSession(request), { owner: 'bruno' }),
  )

/** Runs `steps` as a Presente with no login, in a context of her own that
 * closes after; she starts at `href` when it is given. */
async function asParticipant(
  browser: Browser,
  href: string | undefined,
  steps: (participant: Page, guest: BrowserContext) => Promise<void>,
) {
  const guest = await browser.newContext()
  try {
    const participant = await guest.newPage()
    if (href !== undefined) await participant.goto(href)
    await steps(participant, guest)
  } finally {
    await guest.close()
  }
}

// The Link da Sessão (#180): the Dono shares it, a Presente with no login
// picks who she is and sees the current films, until the Feedback.

test('the Dono shares the current films with a Presente who has no login', async ({
  page,
  browser,
}, info) => {
  const { person, name } = guestOf(info)
  const opened = await openAsBruno({
    attendees: ['dono', person],
    count: 3,
    request: 'Pedido particular da Sessão',
  })
  await loginAsBruno(page)
  const ownerPage = await page.goto(`/sessoes/${opened.session.id}`)
  expect(ownerPage?.headers()['cache-control']).toContain('no-store')
  await page.getByLabel('Mais ações da Sessão').click()
  const link = page.getByRole('link', { name: 'Link para os Presentes' })
  await expect(link).toBeVisible()
  await snap(page, info, 'sessao-link')
  const href = new URL((await link.getAttribute('href')) ?? '', page.url())
  await asParticipant(browser, undefined, async (participant) => {
    const response = await participant.goto(href.href)
    expect(response?.headers()).toMatchObject({
      'cache-control': 'private, no-store',
      'referrer-policy': 'no-referrer',
      'x-robots-tag': 'noindex',
    })
    await expect(
      participant.getByRole('heading', { name: 'Quem é você?' }),
    ).toBeVisible()
    // The Dono who opened it is no guest to pick (#275).
    await expect(participant.getByRole('link', { name: 'Bruno' })).toHaveCount(
      0,
    )
    await expect(participant.getByRole('link', { name: 'Iara' })).toHaveCount(0)
    await snap(participant, info, 'sessao-escolher-presente')
    const choice = participant.getByRole('link', { name, exact: true })
    const selected = new URL((await choice.getAttribute('href')) ?? '', href)
    const selectedPage = await participant.goto(selected.href)
    const films = participant.getByRole('list', { name: 'Filmes da Sessão' })
    await expect(films.getByRole('listitem')).toContainText(
      opened.films.map((film) => film.title),
    )
    expect(await selectedPage?.text()).not.toMatch(
      /Pedido particular da Sessão|@example\.org|"evidence"|"utility"/u,
    )
    await snap(participant, info, 'sessao-filmes-presentes')
    await expect(
      participant.getByRole('button', { name: 'Enviar' }),
    ).toHaveCount(0)
  })
})

/** The Link para os Presentes of the Session at `path`, the same after a
 * reload; gives it and the link on the page. */
async function sharedLinkOf(page: Page, path: string) {
  await loginAsBruno(page)
  await page.goto(path)
  await openMenu(page)
  const share = page.getByRole('link', { name: 'Link para os Presentes' })
  const shared = await share.getAttribute('href')
  if (!shared) throw new Error('the Session had no link')
  await page.reload()
  await openMenu(page)
  await expect(share).toHaveAttribute('href', shared)
  return { share, shared }
}

/** The link opens no films without the Presente's choice, nor for another
 * Session or without its key. */
async function linkOpensOnlyItsSession(
  participant: Page,
  shared: string,
  session: string,
  other: string,
) {
  const unavailable = participant.getByRole('heading', {
    name: 'Esse link não abre',
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
}

test('the link only works for its Session while it is open', async ({
  page,
  browser,
}, info) => {
  test.skip(
    info.project.name !== 'desktop',
    'the capability is device-independent',
  )
  const open = async (person: string) =>
    (await openAsBruno({ attendees: ['dono', person] })).session.id
  const session = await open('teo')
  const other = await open('iara')
  const path = `/sessoes/${session}`
  const { share, shared } = await sharedLinkOf(page, path)

  await asParticipant(browser, undefined, async (participant, guest) => {
    await linkOpensOnlyItsSession(participant, shared, session, other)

    // Another site's Dono can see the normal Cartaz, but cannot issue its link.
    await loginAs(await guest.newPage(), 'vera@example.org')
    await participant.goto(new URL(path, shared).href)
    await expect(
      participant.getByRole('heading', {
        name: 'Sex, 20 nov',
      }),
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
    await expect(
      participant.getByRole('heading', { name: 'Essa Sessão já fechou' }),
    ).toBeVisible()
    await snap(participant, info, 'sessao-link-encerrado')
  })
})

/** Opens the Session at `path` as Bruno; gives the link of `person`. */
async function brunoSharesWith(page: Page, path: string, person: string) {
  await loginAsBruno(page)
  await page.goto(path)
  return sessionLinkFor(page, person)
}

// The Perguntas par a par (#181): through the link, a Presente says which of
// two films she liked more; the answers wait on the Session's page until
// the Dono records them.

/** Prefers one film of the first pair and has not seen the second pair;
 * gives the form and the two films of the first pair. */
async function answerTwoQuestions(participant: Page, info: TestInfo) {
  await participant.getByRole('link', { name: 'Responder perguntas' }).click()
  const question = participant.getByRole('form', {
    name: 'Qual dos dois você gostou mais?',
  })
  await expect(question).toContainText('Pergunta 1 de 10')
  await snap(participant, info, 'perguntas-par-a-par')
  const [chosen, other] = await question
    .getByRole('button')
    // The title under each tape; the tape without a poster repeats it.
    .evaluateAll((buttons) =>
      buttons.map((b) => b.lastElementChild?.textContent ?? ''),
    )
  await question.getByRole('button', { name: chosen }).click()
  await expect(question).toContainText('Pergunta 2 de 10')
  await question.getByRole('button', { name: 'Não vi algum dos dois' }).click()
  await expect(question).toContainText('Pergunta 3 de 10')
  return { question, chosen, other }
}

async function brunoRecordsAnswers(
  page: Page,
  info: TestInfo,
  path: string,
  name: string,
  [chosen, other]: (string | undefined)[],
) {
  await page.reload()
  const answers = page.getByRole('form', { name })
  await expect(answers.getByRole('listitem')).toHaveText([
    `Preferiu ${chosen} a ${other}`,
  ])
  await snap(page, info, 'sessao-perguntas-dono')
  await page.evaluate(() => {
    document.documentElement.dataset.perguntas = 'original'
  })
  const post = Promise.withResolvers<void>()
  await page.route(`**${path}/perguntas`, async (route) => {
    await post.promise
    await route.continue()
  })
  const record = answers.getByRole('button', {
    name: `Gravar as respostas de ${name}`,
  })
  await record.click()
  try {
    await expect(
      page.getByRole('status').filter({ hasText: 'Enviando decisão…' }),
    ).toBeVisible()
    await expect(record).toBeDisabled()
    await expect(
      answers.getByRole('button', { name: 'Descartar' }),
    ).toBeDisabled()
    await snap(page, info, 'sessao-perguntas-enviando')
  } finally {
    post.resolve()
  }
  await expect(page).toHaveURL(/\?feito=perguntas-gravadas$/)
  await expect(page.getByRole('status').first()).toContainText(
    'Respostas gravadas',
  )
  await expect(page.getByRole('form', { name })).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute(
    'data-perguntas',
    'original',
  )
  await snap(page, info, 'sessao-perguntas-gravadas')
}

/** A later answer can still be discarded through a plain POST. */
async function discardWithoutJavaScript(
  browser: Browser,
  page: Page,
  question: Locator,
  path: string,
  name: string,
) {
  await question.getByRole('button').first().click()
  await expect(question).toContainText('Pergunta 4 de 10')
  const plain = await browser.newContext({
    javaScriptEnabled: false,
    storageState: await page.context().storageState(),
  })
  try {
    const owner = await plain.newPage()
    await owner.goto(new URL(path, page.url()).href)
    await owner
      .getByRole('form', { name })
      .getByRole('button', { name: 'Descartar' })
      .click()
    await expect(notice(owner).first()).toContainText('Respostas descartadas')
    await expect(owner.getByRole('form', { name })).toHaveCount(0)
  } finally {
    await plain.close()
  }
}

test('a Presente answers pairwise questions and the Dono records them', async ({
  page,
  browser,
}, info) => {
  const person = info.project.name === 'desktop' ? 'teo' : 'iara'
  const name = info.project.name === 'desktop' ? 'Teo' : 'Iara'
  const opened = await openAsBruno({ attendees: ['dono', person], count: 2 })
  const path = `/sessoes/${opened.session.id}`
  const href = await brunoSharesWith(page, path, person)

  await asParticipant(browser, href, async (participant) => {
    const { question, chosen, other } = await answerTwoQuestions(
      participant,
      info,
    )
    await brunoRecordsAnswers(page, info, path, name, [chosen, other])
    if (info.project.name === 'desktop')
      await discardWithoutJavaScript(browser, page, question, path, name)
  })
})

/** Votes yes, no and yes on the three films, from the first. */
async function voteYesNoYes(
  participant: Page,
  info: TestInfo,
  name: string,
  [first, second]: (string | undefined)[],
) {
  await expect(participant.getByText(name, { exact: true })).toBeVisible()
  await participant.getByRole('link', { name: 'Votar nos filmes' }).click()
  await expect(participant.getByRole('heading', { name: first })).toBeVisible()
  await snap(participant, info, 'sessao-votar')

  await participant.getByRole('button', { name: 'Sim', exact: true }).click()
  await expect(participant.getByRole('heading', { name: second })).toBeVisible()
  await participant.getByRole('button', { name: 'Não', exact: true }).click()
  await participant.getByRole('button', { name: 'Sim', exact: true }).click()
  await expect(participant.getByText('2 sins · 1 não')).toBeVisible()
  await snap(participant, info, 'sessao-votos-resumo')
}

/** Sends the votes; the no swaps `second` for a film to vote on. */
async function sendVotesSwapping(
  participant: Page,
  info: TestInfo,
  second: string | undefined,
) {
  // Keep the POST pending long enough to check the sending state.
  const send = Promise.withResolvers<void>()
  await participant.route('**/participar/votos?**', async (route) => {
    await send.promise
    await route.continue()
  })
  await participant.evaluate(() => {
    document.documentElement.dataset.votePage = 'original'
  })
  try {
    await participant.getByRole('button', { name: 'Enviar votos' }).click()
    await expect(
      participant.getByRole('button', { name: 'Enviando votos…' }),
    ).toBeDisabled()
    await snap(participant, info, 'sessao-votos-enviando')
  } finally {
    send.resolve()
  }
  await expect(participant.getByRole('status')).toContainText(
    'outro entrou no lugar',
  )
  await expect(participant.locator('html')).toHaveAttribute(
    'data-vote-page',
    'original',
  )
  // The night's list as it is now; only the film that came in is left
  // to vote on.
  await expect(
    participant.getByRole('heading', { name: 'Votos enviados' }),
  ).toBeVisible()
  await participant.getByRole('link', { name: 'Votar no que chegou' }).click()
  const newcomer = participant.getByRole('article')
  await expect(newcomer).toHaveCount(1)
  await expect(newcomer).not.toContainText(second ?? '')
  await expect(participant.getByText('Filme 1 de 1')).toBeVisible()
  await snap(participant, info, 'sessao-votos-enviados')
}

test('each Presente votes on the films; a no swaps the film and the Session is redone', async ({
  page,
  browser,
}, info) => {
  const { person, name } = guestOf(info)
  const opened = await openAsBruno({ attendees: ['dono', person], count: 3 })
  const [first, second, third] = opened.films.map((film) => film.title)
  const href = await brunoSharesWith(
    page,
    `/sessoes/${opened.session.id}`,
    person,
  )
  await asParticipant(browser, href, async (participant) => {
    await voteYesNoYes(participant, info, name, [first, second])
    await sendVotesSwapping(participant, info, second)

    await page.reload()
    await page.getByText('por quê', { exact: true }).click()
    await expect(page.getByText(/Saiu da prateleira/u)).toBeVisible()
    const onCartaz = (title?: string) =>
      page.getByRole('heading', { level: 3 }).filter({ hasText: title })
    await expect(onCartaz(second)).toHaveCount(0)
    await expect(onCartaz(first)).toHaveCount(1)
    await expect(onCartaz(third)).toHaveCount(1)
    await snap(page, info, 'sessao-cartaz-depois-dos-votos')
  })
})

/** One earlier yes of each `[who, film]`, on the first version. */
async function castEarlierYes(
  session: string,
  yeses: readonly (readonly [string, string])[],
) {
  for (const [who, film] of yeses)
    await engineRun((engine) =>
      engine.run(
        castVotes({
          session,
          person: who,
          version: 1,
          votes: [{ film, vote: 'yes' }],
        }),
      ),
    )
}

test('a Presente sends only yes votes and the Dono sees the new Cartaz order', async ({
  page,
  browser,
}, info) => {
  const { person } = guestOf(info)
  const other = info.project.name === 'desktop' ? 'iara' : 'teo'
  const opened = await openAsBruno({
    attendees: ['dono', person, other],
    count: 3,
  })
  const [first, second, third] = opened.films
  const session = opened.session.id
  // One earlier yes of this Presente on the first film, and one of the
  // other on the third. The deck shows what this Presente has yet to vote
  // on, and sends her earlier yes again with the new ones.
  await castEarlierYes(session, [
    [person, first!.id],
    [other, third!.id],
  ])

  await loginAsBruno(page)
  await page.goto(`/sessoes/${session}`)
  const titles = page.getByRole('article').getByRole('heading', { level: 3 })
  await expect(titles).toHaveCount(3)
  await expect(titles).toContainText([
    first!.title,
    second!.title,
    third!.title,
  ])
  const href = await sessionLinkFor(page, person)

  await asParticipant(browser, href, async (participant) => {
    // Her earlier yes counts: the deck holds the 2 she has not voted on.
    await participant
      .getByRole('link', { name: 'Votar nos 2 que chegaram' })
      .click()
    const yes = participant.getByRole('button', { name: 'Sim', exact: true })
    await yes.click()
    await yes.click()
    await expect(participant.getByText('2 sins · nenhum não')).toBeVisible()
    await participant.getByRole('button', { name: 'Enviar votos' }).click()
    await expect(participant.getByRole('status')).toHaveText(
      'Votos contados. A lista foi atualizada.',
    )
    await snap(participant, info, 'sessao-sins-contados')

    await page.reload()
    await expect(titles).toHaveCount(3)
    await expect(titles).toContainText([
      third!.title,
      first!.title,
      second!.title,
    ])
    await snap(page, info, 'sessao-cartaz-reordenado')

    // Mudar votos opens again over every film (pass 4 F1): the router
    // writes `mudar` back, and the page must keep it. Her Votos come back
    // chosen, on the recap (#340); Recomeçar asks every film again.
    await participant
      .getByRole('link', { name: 'Mudar votos', exact: true })
      .click()
    await expect(participant).toHaveURL(/[?&]mudar=true(?:&|$)/u)
    await expect(
      participant.getByRole('heading', { level: 1, name: 'Revise seus votos' }),
    ).toBeVisible()
    await expect(
      participant.getByText(/Seus votos de antes estão marcados/u),
    ).toBeVisible()
    await snap(participant, info, 'sessao-mudar-votos')
    await participant.getByRole('button', { name: 'Recomeçar' }).click()
    await expect(participant.getByText('Filme 1 de 3')).toBeVisible()
  })
})
