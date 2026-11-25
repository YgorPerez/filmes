// What holds over every Restrição (`restricoes/__init__.py`): reading the
// request in the modules' order, the label of a stored one, and the two
// hooks a refazer uses, `inherit` (`herdar`) and `replacesList`
// (`troca_a_lista`). No local Restrição has the hooks (the "parecido" will):
// stand-ins exercise them.

import { Effect } from 'effect'
import { expect, test } from 'vite-plus/test'
import {
  constraintLabel,
  drop,
  inheritConstraints,
  readConstraints,
  replacingList,
  storedConstraints,
  type Constraint,
  type ConstraintModule,
  type ConstraintRequest,
} from '../../../src/index.ts'
import { useFixture } from '../../fixture.ts'

test('the first request that makes no sense fails, in the modules order', async () => {
  // Year comes before duration, as `ano.py` before `duracao.py`.
  expect(
    await useFixture().run(
      readConstraints({ maxDuration: 0, since: 2020, until: 2010 }),
    ),
  ).toEqual({
    exitCode: 2,
    output: {
      error: {
        code: 'invalid_usage',
        message: '--desde 2020 depois de --ate 2010',
      },
    },
  })
})

test('the Restrições asked come in the modules order, and the Session stores all but the duration', async () => {
  const asked = await Effect.runPromise(
    readConstraints({
      noSad: true,
      language: ' pt ',
      maxDuration: 90,
      until: 2000,
      unseen: true,
      noSlow: true,
    }),
  )

  expect(asked.map((c) => c.name)).toEqual([
    'year',
    'duration',
    'language',
    'unseen',
    'no_slow',
    'no_sad',
  ])
  expect(storedConstraints(asked)).toEqual([
    { name: 'year', since: null, until: 2000 },
    { name: 'language', language: 'pt' },
    { name: 'unseen' },
    { name: 'no_slow' },
    { name: 'no_sad' },
  ])
  expect(asked.map((c) => constraintLabel(c.stored()))).toEqual([
    'até 2000',
    'até 1h30',
    'idioma original: pt',
    'nada repetido',
    'nada lento',
    'nada triste',
  ])
})

test('a stored Restrição no file knows has no label', () => {
  expect(constraintLabel({ name: 'no_repeat' })).toBeNull()
})

interface SimilarRequest extends ConstraintRequest {
  readonly similar?: ReadonlyArray<string>
  readonly noSimilar?: boolean
}

const similar = (films: ReadonlyArray<string>): Constraint => ({
  name: 'similar',
  toJson: () => ({ films }),
  stored: () => ({ name: 'similar', films }),
  result: () => ({}),
  evaluate: () => Effect.succeed(new Map([['tt1', drop()]])),
  // References the current version did not have: a new request.
  replacesList: (stored) => {
    const before = new Set((stored?.['films'] as string[] | undefined) ?? [])
    return (
      before.size !== new Set(films).size || films.some((f) => !before.has(f))
    )
  },
})

/** A stand-in for the "parecido": the refazer keeps the stored films. */
const similarModule: ConstraintModule<SimilarRequest> = {
  name: 'similar',
  read: (request) =>
    Effect.succeed(request.similar ? similar(request.similar) : undefined),
  label: (stored) => `parecidos com ${String(stored['films'])}`,
  inherit: (request, stored) =>
    stored && !request.similar && !request.noSimilar
      ? { ...request, similar: stored['films'] as string[] }
      : request,
}

test('on a refazer, a module with inherit gets its stored Restrição and puts it back', () => {
  const stored = [
    { name: 'no_sad' },
    { name: 'similar', films: ['tt1'] },
    { name: 'similar', films: ['tt2'] },
  ]

  expect(
    inheritConstraints<SimilarRequest>({ noSad: true }, stored, [
      similarModule,
    ]),
  ).toEqual({ noSad: true, similar: ['tt2'] })
  expect(
    inheritConstraints<SimilarRequest>({ noSimilar: true }, stored, [
      similarModule,
    ]),
  ).toEqual({ noSimilar: true })
  expect(inheritConstraints<SimilarRequest>({}, [], [similarModule])).toEqual(
    {},
  )
  // The local Restrições inherit nothing: a refazer asks them again.
  expect(inheritConstraints({ unseen: true }, stored)).toEqual({
    unseen: true,
  })
})

test('on a refazer, only a Restrição new against the stored one replaces the list', async () => {
  const local = await Effect.runPromise(readConstraints({ noSad: true }))
  const stored = [{ name: 'similar', films: ['tt1'] }]

  expect(
    replacingList([...local, similar(['tt1'])], stored).map((c) => c.name),
  ).toEqual([])
  expect(
    replacingList([...local, similar(['tt1', 'tt2'])], stored).map(
      (c) => c.name,
    ),
  ).toEqual(['similar'])
  expect(replacingList([similar(['tt3'])], []).map((c) => c.name)).toEqual([
    'similar',
  ])
})
