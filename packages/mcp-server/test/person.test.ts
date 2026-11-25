// The `person` tool (#110): the old MCP's pessoa.test and remover.test (the
// `pessoa` part), through an SDK client on the engine fixture.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'vite-plus/test'
import { useFixture } from '../../engine/test/fixture.ts'
import { connect, failureText, type Connected } from './connect.ts'

const person = (c: Connected, args: Record<string, unknown>) =>
  c.ok('person', args)

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' })

/** The fixture's filmes-dados as a git repo, so each write is a commit. */
const asRepo = (data: string) => {
  git(data, 'init', '--quiet', '-b', 'master')
  git(data, 'add', '--all')
  git(
    data,
    '-c',
    'user.name=fixture',
    '-c',
    'user.email=fixture@example.org',
    'commit',
    '--quiet',
    '-m',
    'initial',
  )
}

describe('person', () => {
  test('creates, states, reports, vetoes and shows a Pessoa', async () => {
    const c = await connect(useFixture())

    await person(c, {
      action: 'create',
      name: 'Ana',
      slug: 'ana',
      aliases: ['Aninha'],
    })
    const stated = await person(c, {
      action: 'state',
      person: 'ana',
      text: 'adoro a Sofia Rangel',
      entity: 'Q9000018',
      reaction: 'like',
      source: 'questionário',
    })
    const report = await person(c, {
      action: 'report',
      person: 'ana',
      text: '-- odeia filme lento',
    })
    await person(c, {
      action: 'veto',
      person: 'ana',
      text: 'nunca vê terror',
      entity: 'Q9001801',
    })
    const view = await person(c, { action: 'view', person: 'Aninha' })

    assert.equal(stated.stated.strength, 'strong')
    assert.equal(report.report.text, '-- odeia filme lento')
    assert.equal(view.person, 'ana')
    assert.equal(view.stated.length, 1)
    assert.equal(view.reports.length, 1)
    assert.deepEqual(
      view.vetoes.map((v: { label: string }) => v.label),
      ['Terror'],
    )
    // The Veto acts in the Recomendação.
    const recommendation = await c.ok('recommend', {
      attendees: ['dono', 'ana'],
      count: 50,
    })
    assert.deepEqual(
      recommendation.vetoes.map((v: { person: string }) => v.person),
      ['ana'],
    )
  })

  test('vetoes a tag group and takes the Veto back', async () => {
    const c = await connect(useFixture())

    const veto = await person(c, {
      action: 'veto',
      person: 'teo',
      text: 'não quer comédia boba',
      group: 'silly_comedy',
    })
    const removed = await person(c, {
      action: 'remove',
      person: 'teo',
      remove: { kind: 'veto', id: 'silly_comedy' },
    })

    assert.deepEqual(
      [veto.veto.target, veto.veto.label],
      ['silly_comedy', 'comédia boba'],
    )
    assert.equal(removed.removed.target, 'silly_comedy')
    assert.deepEqual(
      (await person(c, { action: 'view', person: 'teo' })).vetoes,
      [],
    )
  })

  test('records an Ajuste and undoes it', async () => {
    const c = await connect(useFixture())

    const adjusted = await person(c, {
      action: 'adjust',
      person: 'teo',
      link: 'cast',
      level: 'none',
    })
    assert.deepEqual(
      [adjusted.adjustment.link, adjusted.adjustment.level, adjusted.new],
      ['cast', 'none', true],
    )
    assert.deepEqual(
      (await person(c, { action: 'view', person: 'teo' })).adjustments.map(
        (a: { level: string }) => a.level,
      ),
      ['none'],
    )

    await person(c, {
      action: 'adjust',
      person: 'teo',
      link: 'cast',
      level: 'normal',
    })
    assert.deepEqual(
      (await person(c, { action: 'view', person: 'teo' })).adjustments,
      [],
    )
    const missing = await c.error('person', {
      action: 'adjust',
      person: 'teo',
      link: 'cast',
    })
    assert.deepEqual(missing.error, {
      code: 'invalid_usage',
      message: 'person adjust precisa de: level',
    })
  })

  test('keeps, lists and drops open questions; skipped twice, one leaves', async () => {
    const c = await connect(useFixture())

    const skipped = await person(c, {
      action: 'skip',
      person: 'teo',
      text: 'o Teo curte a Helena Prado?',
      entity: 'Q9000001',
    })
    const other = await person(c, {
      action: 'skip',
      person: 'teo',
      text: '-- topa comédia boba?',
      group: 'silly_comedy',
    })
    const open = await person(c, { action: 'questions', person: 'teo' })
    const again = await person(c, {
      action: 'skip',
      person: 'teo',
      text: 'e a Helena Prado?',
      entity: 'Q9000001',
    })
    await person(c, {
      action: 'remove',
      person: 'teo',
      remove: { kind: 'open_question', id: 'silly_comedy' },
    })

    assert.deepEqual(
      [skipped.openQuestion.label, skipped.openQuestion.skips, skipped.dropped],
      ['Helena Prado', 1, false],
    )
    assert.equal(other.openQuestion.text, '-- topa comédia boba?')
    assert.deepEqual(
      open.openQuestions.map((q: { subject: string }) => q.subject),
      ['Q9000001', 'silly_comedy'],
    )
    assert.deepEqual([again.openQuestion.skips, again.dropped], [2, true])
    assert.deepEqual(
      (await person(c, { action: 'questions', person: 'teo' })).openQuestions,
      [],
    )
  })

  test('records a Já visto with a Nota out of 10; unseen leaves the film out', async () => {
    const c = await connect(useFixture())

    const seen = await person(c, {
      action: 'seen',
      person: 'teo',
      film: 'tt9000601',
      rating: '8/10',
      date: '2026-11-19',
    })
    const recommendation = await c.ok('recommend', {
      attendees: ['teo'],
      count: 50,
      unseen: true,
    })

    assert.deepEqual([seen.seen.rating, seen.seen.date], [4, '2026-11-19'])
    assert.ok(
      !recommendation.films.some((f: { id: string }) => f.id === 'tt9000601'),
    )
  })

  test('removes a Veto by its factId and a Já visto by its film', async () => {
    const c = await connect(useFixture())
    const { veto } = await person(c, {
      action: 'veto',
      person: 'teo',
      text: 'nunca vê terror',
      entity: 'Q9001801',
    })
    await person(c, { action: 'seen', person: 'teo', film: 'tt9000601' })

    const removed = await person(c, {
      action: 'remove',
      person: 'teo',
      remove: { kind: 'veto', id: veto.factId },
    })
    await person(c, {
      action: 'remove',
      person: 'teo',
      remove: { kind: 'seen', id: 'tt9000601' },
    })

    assert.equal(removed.removed.target, 'Q9001801')
    const view = await person(c, { action: 'view', person: 'teo' })
    assert.deepEqual([view.vetoes, view.seen], [[], []])
  })

  test('an action without what it needs is invalid_usage; a bad field never reaches the engine', async () => {
    const c = await connect(useFixture())

    for (const [args, message] of [
      [{ action: 'seen', person: 'teo' }, 'person seen precisa de: film'],
      [{ action: 'view' }, 'person view precisa de: person'],
      [{ action: 'remove', person: 'teo' }, 'person remove precisa de: remove'],
      [
        { action: 'veto', person: 'teo', text: 'nunca vê terror' },
        'person veto precisa de film, entity ou group',
      ],
      [
        {
          action: 'veto',
          person: 'teo',
          text: 'x',
          group: 'slow',
          film: 'tt9000601',
        },
        'o Veto tem um alvo só',
      ],
      [
        {
          action: 'state',
          person: 'teo',
          text: 'x',
          film: 'tt9000601',
          entity: 'Q9000001',
        },
        'mande film ou entity, um só',
      ],
    ] as const)
      assert.deepEqual((await c.error('person', args)).error, {
        code: 'invalid_usage',
        message,
      })
    assert.match(
      failureText(
        await c.call('person', {
          action: 'seen',
          person: 'teo',
          film: 'Toy Story',
        }),
      ),
      /tt seguido de dígitos/,
    )
    assert.match(
      failureText(await c.call('person', { action: 'view', person: '--x' })),
      /não pode começar com '-'/,
    )
  })

  test('"dono" is the logged-in Pessoa, and she signs every write', async () => {
    const fixture = useFixture()
    asRepo(fixture.data)
    const c = await connect(fixture, 'iara')

    const view = await person(c, { action: 'view', person: 'dono' })
    await person(c, {
      action: 'state',
      person: 'dono',
      text: 'gosto de drama',
    })

    assert.equal(view.person, 'iara')
    assert.equal(
      git(fixture.data, 'log', '-1', '--format=%an <%ae>|%s').trim(),
      'Iara <iara@example.org>|pessoa declarar dono: gosto de drama',
    )
  })

  test('without a login, the Dono of the data signs', async () => {
    const fixture = useFixture()
    asRepo(fixture.data)
    const c = await connect(fixture)

    await person(c, { action: 'state', person: 'dono', text: 'gosto de drama' })

    assert.equal(
      git(fixture.data, 'log', '-1', '--format=%an <%ae>').trim(),
      'Bruno <bruno@example.org>',
    )
  })

  test('create makes a Dono with her e-mail, signed by the logged-in Dono; without the e-mail, no', async () => {
    const fixture = useFixture()
    asRepo(fixture.data)
    const c = await connect(fixture, 'bruno')

    const refused = await c.error('person', {
      action: 'create',
      name: 'Luana',
      owner: true,
    })
    const created = await person(c, {
      action: 'create',
      name: 'Luana',
      owner: true,
      email: 'Luana@Example.org',
    })

    assert.deepEqual(refused.error, {
      code: 'invalid_usage',
      message: 'um Dono precisa do e-mail do Google, para entrar no site',
      reason: 'email_required',
    })
    assert.deepEqual(created, {
      person: 'luana',
      name: 'Luana',
      aliases: [],
      owner: true,
    })
    assert.match(
      readFileSync(join(fixture.data, 'people', 'luana.md'), 'utf8'),
      /^email: luana@example\.org$/m,
    )
    assert.equal(
      git(fixture.data, 'log', '-1', '--format=%an <%ae>|%s').trim(),
      'Bruno <bruno@example.org>|pessoa criar Luana',
    )
  })

  test('with no Dono in the data, the engine signs; create makes the slug', async () => {
    const fixture = useFixture()
    for (const slug of ['bruno', 'vera']) {
      const file = join(fixture.data, 'people', `${slug}.md`)
      writeFileSync(
        file,
        readFileSync(file, 'utf8').replace(/^owner: true\n/m, ''),
      )
    }
    asRepo(fixture.data)
    const c = await connect(fixture)

    const created = await person(c, { action: 'create', name: 'Zé Lima' })

    assert.deepEqual(created, {
      person: 'ze-lima',
      name: 'Zé Lima',
      aliases: [],
      owner: false,
    })
    assert.equal(
      git(fixture.data, 'log', '-1', '--format=%an <%ae>').trim(),
      'filmes <>',
    )
  })
})
