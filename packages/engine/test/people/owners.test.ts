// Several Donos (#131). The fixture has two: Bruno and Vera, each with her
// own email. The logged-in one (`engine.run(op, { owner })`) is "dono",
// "Você" on the Cartaz, the Dono who opens a Session and speaks for herself
// in its Feedback, and signs the commit. With no login (a script, the
// tests), the first Dono by slug, Bruno.

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'
import {
  billboard,
  parseYaml,
  personReport,
  readPeople,
  recommendSession,
  recordFeedback,
  resolvePerson,
  yamlToJson,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'

const VERA = { owner: 'vera' }

const front = (fixture: Fixture, id: string) => {
  const text = readFileSync(join(fixture.data, 'sessions', `${id}.md`), 'utf8')
  return yamlToJson(parseYaml(text.slice(4, text.indexOf('\n---', 4)))) as {
    owner: string
    feedback: { reactions: { person: string; relayed?: boolean }[] }
  }
}

const gitIn = (cwd: string, ...args: string[]) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout
}

describe('two Donos', () => {
  test('the reload reads both', async () => {
    const fixture = useFixture()

    const people = await fixture.ok(readPeople)

    expect(people.filter((p) => p.owner).map((p) => p.slug)).toEqual([
      'bruno',
      'vera',
    ])
  })

  test('"dono" is the logged-in Dono, else the first by slug', async () => {
    const fixture = useFixture()

    expect((await fixture.ok(resolvePerson('dono'))).slug).toBe('bruno')
    expect((await fixture.ok(resolvePerson('Dono'), {}, VERA)).slug).toBe(
      'vera',
    )
  })
})

describe('two Donos', () => {
  test('each opens her own Session and is "Você" on its Cartaz', async () => {
    const fixture = useFixture()

    const vera = await fixture.ok(
      recommendSession({ attendees: ['dono', 'bruno'] }),
      {},
      VERA,
    )
    const bruno = await fixture.ok(
      recommendSession({ attendees: ['dono', 'iara'] }),
    )

    expect(vera.attendees).toEqual(['vera', 'bruno'])
    expect(vera.session.id).toBe('2026-11-20-bruno')
    expect(front(fixture, vera.session.id).owner).toBe('vera')
    expect(front(fixture, bruno.session.id).owner).toBe('bruno')
    const labels = async (owner?: string) =>
      (
        await fixture.ok(
          billboard({ session: vera.session.id }),
          {},
          owner === undefined ? {} : { owner },
        )
      ).billboard.attendees.map((p) => [p.slug, p.label, p.owner])
    expect(await labels('vera')).toEqual([
      ['vera', 'Você', true],
      ['bruno', 'Bruno', false],
    ])
    expect(await labels('bruno')).toEqual([
      ['vera', 'Vera', false],
      ['bruno', 'Você', true],
    ])
    // No login: the Session's own Dono.
    expect(await labels()).toEqual(await labels('vera'))
  })
})

describe('two Donos', () => {
  test('who records the Feedback speaks for herself', async () => {
    const fixture = useFixture()
    const { session, films } = await fixture.ok(
      recommendSession({ attendees: ['dono', 'vera'] }),
    )
    expect(front(fixture, session.id).owner).toBe('bruno')

    const result = await fixture.ok(
      recordFeedback({
        session: session.id,
        film: films[0]!.id,
        ratings: ['dono=4,5', 'bruno=4'],
        comments: ['vera=lindo'],
      }),
      {},
      VERA,
    )

    expect(front(fixture, session.id).owner).toBe('vera')
    expect(front(fixture, session.id).feedback.reactions).toEqual([
      expect.objectContaining({ person: 'bruno', relayed: true }),
      expect.not.objectContaining({ relayed: true }),
    ])
    expect(result.withoutReaction).toEqual([])
  })

  test('a Relato about another Dono, never about the logged-in one', async () => {
    const fixture = useFixture()
    const report = (person: string) =>
      fixture.run(personReport({ person, text: 'curte drama' }), {}, VERA)

    expect((await report('bruno')).exitCode).toBe(0)
    expect(await report('dono')).toEqual({
      exitCode: 2,
      output: {
        error: {
          code: 'invalid_usage',
          message: 'o Dono falando do próprio gosto é Declarado, não Relato',
        },
      },
    })
  })
})

describe('two Donos', () => {
  test('the logged-in Dono signs the commit', async () => {
    const fixture = useFixture()
    gitIn(fixture.data, 'init', '--quiet', '-b', 'master')
    gitIn(fixture.data, 'add', '--all')
    gitIn(
      fixture.data,
      '-c',
      'user.name=x',
      '-c',
      'user.email=x@x',
      'commit',
      '--quiet',
      '-m',
      'initial',
    )

    await fixture.ok(recommendSession({ attendees: ['dono'] }), {}, VERA)

    expect(gitIn(fixture.data, 'log', '-1', '--format=%an <%ae>').trim()).toBe(
      'Vera <vera@example.org>',
    )
  })
})
