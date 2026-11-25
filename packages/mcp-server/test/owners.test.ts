// Two Donos (#131): the fixture's Bruno and Vera each log in (one server
// each, as the HTTP endpoint makes per token). Each opens her Session, is
// "Você" on its Cartaz and "dono" in its Presentes, records its Feedback
// speaking for herself, writes taste, and signs every commit.

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { describe, test } from 'vite-plus/test'
import { useFixture } from '../../engine/test/fixture.ts'
import { connect } from './connect.ts'

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' })

describe('two Donos', () => {
  test('each is herself: "dono", "Você", her Feedback and her commits', async () => {
    const fixture = useFixture()
    git(fixture.data, 'init', '--quiet', '-b', 'master')
    git(fixture.data, 'add', '--all')
    git(
      fixture.data,
      '-c',
      'user.name=fixture',
      '-c',
      'user.email=fixture@example.org',
      'commit',
      '--quiet',
      '-m',
      'initial',
    )
    const lastAuthor = () =>
      git(fixture.data, 'log', '-1', '--format=%an <%ae>').trim()

    for (const [slug, author] of [
      ['vera', 'Vera <vera@example.org>'],
      ['bruno', 'Bruno <bruno@example.org>'],
    ] as const) {
      const { ok } = await connect(fixture, slug)

      const recommendation = await ok('recommend', {
        attendees: ['dono', 'iara'],
      })
      assert.deepEqual(recommendation.attendees, [slug, 'iara'])
      assert.equal(lastAuthor(), author)

      const session = recommendation.session.id
      const cartaz = await ok('billboard', { session })
      assert.deepEqual(
        cartaz.billboard.attendees.map((p: { slug: string; label: string }) => [
          p.slug,
          p.label,
        ]),
        [
          [slug, 'Você'],
          ['iara', 'Iara'],
        ],
      )

      const feedback = await ok('record_feedback', {
        session,
        film: recommendation.films[0].id,
        ratings: [
          { person: 'dono', rating: 4.5 },
          { person: 'iara', rating: 4 },
        ],
      })
      assert.deepEqual(
        feedback.facts
          .filter((f: { kind: string }) => f.kind === 'rating')
          .map((f: { person: string; source: string }) => [
            f.person,
            f.source.endsWith('repassado pelo Dono'),
          ]),
        [
          [slug, false],
          ['iara', true],
        ],
      )
      assert.equal(lastAuthor(), author)

      const view = await ok('person', { action: 'view', person: 'dono' })
      assert.equal(view.person, slug)
      await ok('person', {
        action: 'state',
        person: 'dono',
        text: 'gosto de drama',
      })
      assert.equal(lastAuthor(), author)
    }
  })
})
