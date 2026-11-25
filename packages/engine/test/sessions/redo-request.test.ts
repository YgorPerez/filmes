// The request that redoes a Session as its current version asked (#114):
// the app's Cartaz regenerates with it after a reply, adding `keep`. No
// Python twin (in the chat, Claude repeats the flags).

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'
import {
  recommendSession,
  sessionRedoRequest,
  type RecommendSessionRequest,
} from '../../src/index.ts'
import { useFixture } from '../fixture.ts'

const ASKED: RecommendSessionRequest = {
  attendees: ['dono', 'iara'],
  count: 3,
  rule: 'by',
  by: 'iara',
  moods: ['leve'],
  request: 'algo leve',
  maxDuration: 130,
  since: 1990,
  child: 7,
  language: 'pt',
  triggers: ['spider'],
  unseen: true,
  noSlow: true,
  noSad: true,
  similar: ['tt9000104'],
}

describe('sessionRedoRequest', () => {
  test('gives back what the current version asked, for the refazer to bring the rest', async () => {
    const fixture = useFixture()
    const opened = await fixture.ok(recommendSession(ASKED))
    const id = opened.session.id

    const request = await fixture.ok(sessionRedoRequest(id))

    // So many Restrições leave no film: with none, the count is the
    // configured one.
    expect(opened.films).toEqual([])
    expect(request).toEqual({
      attendees: ['bruno', 'iara'],
      session: id,
      rule: 'by',
      by: 'iara',
      moods: ['leve'],
      request: 'algo leve',
      maxDuration: 130,
      since: 1990,
      until: undefined,
      child: 7,
      language: 'pt',
      triggers: ['spider'],
      unseen: true,
      noSlow: true,
      noSad: true,
    })
    // Redone with it, the Session keeps every Restrição it had.
    const redone = await fixture.ok(recommendSession(request))
    expect(Object.keys(redone.constraints).toSorted()).toEqual(
      Object.keys({ ...opened.constraints, out_of_session: {} }).toSorted(),
    )
  })

  test('leaves out what the version did not ask, and a Restrição that no longer exists', async () => {
    const fixture = useFixture()
    const opened = await fixture.ok(
      recommendSession({ attendees: ['dono'], child: 0 }),
    )
    const id = opened.session.id
    const file = join(fixture.data, 'sessions', `${id}.md`)
    const text = readFileSync(file, 'utf8')
    writeFileSync(
      file,
      text.replace(
        '  constraints:\n',
        '  constraints:\n  - {name: no_repeat}\n',
      ),
    )

    expect(opened.films.length).toBeGreaterThan(0)
    expect(await fixture.ok(sessionRedoRequest(id))).toEqual({
      attendees: ['bruno'],
      session: id,
      count: opened.films.length,
      moods: [],
      child: 0,
    })
  })

  test('an unknown Session is an error', async () => {
    const outcome = await useFixture().run(sessionRedoRequest('nenhuma'))
    expect(outcome.exitCode).not.toBe(0)
    expect(outcome.output).toMatchObject({ error: { code: 'unknown_session' } })
  })
})
