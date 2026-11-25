// What holds over every Restrição (`restricoes/__init__.py`): reading the
// request in the modules' order, the label of a stored one, and the two
// hooks a refazer uses, `inherit` (`herdar`) and `replacesList`
// (`troca_a_lista`). Only the "parecido" (`similar`) has them.

import { Effect } from 'effect'
import { expect, test } from 'vite-plus/test'
import {
  constraintLabel,
  inheritConstraints,
  readConstraints,
  replacingList,
  storedConstraints,
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
      similar: ['tt1'],
    }),
  )

  expect(asked.map((c) => c.name)).toEqual([
    'year',
    'duration',
    'language',
    'similar',
    'unseen',
    'no_slow',
    'no_sad',
  ])
  expect(storedConstraints(asked)).toEqual([
    { name: 'year', since: null, until: 2000 },
    { name: 'language', language: 'pt' },
    { name: 'similar', films: ['tt1'], titles: [] },
    { name: 'unseen' },
    { name: 'no_slow' },
    { name: 'no_sad' },
  ])
  expect(asked.map((c) => constraintLabel(c.stored()))).toEqual([
    'até 2000',
    'até 1h30',
    'idioma original: pt',
    'parecidos com tt1',
    'nada repetido',
    'nada lento',
    'nada triste',
  ])
})

test('a stored Restrição no file knows has no label', () => {
  expect(constraintLabel({ name: 'no_repeat' })).toBeNull()
})

test('on a refazer, a module with inherit gets its stored Restrição and puts it back', () => {
  const stored = [
    { name: 'no_sad' },
    { name: 'similar', films: ['tt1'] },
    { name: 'similar', films: ['tt2'] },
  ]

  // The last stored with a name wins, as in Python's dict.
  expect(inheritConstraints({ noSad: true }, stored)).toEqual({
    noSad: true,
    similar: ['tt2'],
  })
  // --sem-parecido drops it; --parecido with others replaces it.
  expect(inheritConstraints({ noSimilar: true }, stored)).toEqual({
    noSimilar: true,
  })
  expect(inheritConstraints({ similar: ['tt3'] }, stored)).toEqual({
    similar: ['tt3'],
  })
  // A stored one without films puts nothing back.
  expect(
    inheritConstraints({}, [{ name: 'similar', films: [] }]),
  ).toStrictEqual({ similar: undefined })
  expect(inheritConstraints({}, [])).toEqual({})
  // The local Restrições inherit nothing: a refazer asks them again.
  expect(inheritConstraints({ unseen: true }, [{ name: 'unseen' }])).toEqual({
    unseen: true,
  })
})

test('on a refazer, only a Restrição new against the stored one replaces the list', async () => {
  const read = (similar: ReadonlyArray<string>) =>
    Effect.runPromise(readConstraints({ noSad: true, similar }))
  const stored = [{ name: 'similar', films: ['tt1', 'tt2'] }]
  const replacing = async (similar: ReadonlyArray<string>, before = stored) =>
    replacingList(await read(similar), before).map((c) => c.name)

  // The same references, in any order, are no new request.
  expect(await replacing(['tt2', 'tt1'])).toEqual([])
  expect(await replacing(['tt1'])).toEqual(['similar'])
  expect(await replacing(['tt1', 'tt2', 'tt3'])).toEqual(['similar'])
  expect(await replacing(['tt3'], [])).toEqual(['similar'])
})
