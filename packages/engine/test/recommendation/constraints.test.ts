// The seam the Restrições (#91, #92) plug into: what the pipeline does with
// their verdicts. The real Restrições are not ported yet, so these stand-ins
// exercise each verdict through `recommend`.

import { Effect } from 'effect'
import { describe, expect, test } from 'vite-plus/test'
import {
  drop,
  makeEvidence,
  pass,
  recommend,
  type Candidate,
  type Constraint,
  type ConstraintName,
} from '../../src/index.ts'
import { useFixture } from '../fixture.ts'
import { engineRecommendation, titles } from './support.ts'

const line = (filmId: string, text: string) =>
  makeEvidence({
    person: null,
    filmId,
    text,
    source: 'teste',
    date: '2026-11-20',
    strength: 'strong',
    kind: 'metadata',
    factId: `teste:${filmId}`,
    base: 0,
  })

/** Passes every film with a line, except the ones named. */
const local = (
  name: ConstraintName,
  out: ReadonlyArray<string>,
  cause: string | null = null,
): Constraint => ({
  name,
  toJson: () => ({ asked: name }),
  result: (drops) =>
    drops.size > 0 ? { byCause: Object.fromEntries(drops) } : {},
  evaluate: (_, films) =>
    Effect.succeed(
      new Map(
        [...films.keys()].map((id) => [
          id,
          out.includes(id) ? drop(cause) : pass([line(id, `passa em ${name}`)]),
        ]),
      ),
    ),
})

/** Leaves every film pending; a source answers for the ones in reach. */
const onDemand = (out: ReadonlyArray<string>, asked: string[]): Constraint => ({
  name: 'child',
  toJson: () => ({}),
  result: () => ({}),
  evaluate: (_, films) =>
    Effect.succeed(
      new Map([...films.keys()].map((id) => [id, 'pending' as const])),
    ),
  resolve: (_, film: Candidate, consult) =>
    Effect.sync(() => {
      if (consult) asked.push(film.id)
      return out.includes(film.id)
        ? drop('sem classificação')
        : pass([line(film.id, 'livre')])
    }),
  listWarning: (found, count) =>
    found < count ? `só ${found} de ${count}` : null,
})

describe('the Restrições seam', () => {
  test('a film a Restrição drops never reaches the order, and the count says so', async () => {
    const fixture = useFixture()
    const plain = titles(
      await engineRecommendation(fixture, { attendees: ['dono'] }),
    )
    const out = await engineRecommendation(fixture, {
      attendees: ['dono'],
      constraints: [local('year', ['tt9000104'], 'antes')],
    })

    expect(plain).toContain('As Horas Lentas')
    expect(titles(out)).not.toContain('As Horas Lentas')
    expect(out.constraints).toEqual({
      year: { asked: 'year', byCause: { antes: 1 }, removed: 1 },
    })
    expect(out.films[0]?.filmLines[0]?.text).toBe('passa em year')
  })

  test("the Restrições run in Python's module order, and the first to drop a film counts it", async () => {
    const out = await engineRecommendation(useFixture(), {
      attendees: ['dono'],
      constraints: [
        local('no_sad', ['tt9000104']),
        local('duration', ['tt9000104']),
      ],
    })

    expect(Object.keys(out.constraints)).toEqual(['duration', 'no_sad'])
    expect(out.constraints['duration']?.['removed']).toBe(1)
    expect(out.constraints['no_sad']?.['removed']).toBe(0)
    expect(out.films[0]?.filmLines.slice(0, 2).map((l) => l.text)).toEqual([
      'passa em duration',
      'passa em no_sad',
    ])
  })

  test('a pending film is resolved after the order, asking only within reach', async () => {
    const fixture = useFixture()
    const asked: string[] = []
    const plain = await engineRecommendation(fixture, {
      attendees: ['dono'],
      count: 100,
    })
    const [first, second] = plain.films.map((f) => f.id)

    const out = await engineRecommendation(fixture, {
      attendees: ['dono'],
      count: 100,
      constraints: [onDemand([first ?? ''], asked)],
    })

    expect(out.films[0]?.id).toBe(second)
    expect(out.films[0]?.filmLines[0]?.text).toBe('livre')
    expect(out.constraints).toEqual({ child: { removed: 1 } })
    // `[constraints] on_demand_reach` is 50: the films past it are decided
    // without asking.
    expect(asked).toHaveLength(50)
    expect(out.films.length).toBeLessThan(100)
    expect(out.warnings).toContain(`só ${out.films.length} de 100`)
  })

  test('a Restrição that leaves a film pending must resolve it', async () => {
    const { resolve: _, ...cannot } = onDemand([], [])
    const outcome = await useFixture().run(
      recommend({ attendees: ['dono'], constraints: [cannot] }),
    )

    expect(outcome.exitCode).toBe(1)
    expect(outcome.output).toEqual({
      error: {
        code: 'internal',
        message:
          'TypeError: the constraint child left a film pending and cannot resolve it',
      },
    })
  })
})
