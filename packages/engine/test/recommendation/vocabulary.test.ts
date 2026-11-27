// The closed lists the database stores in Portuguese, read into the
// engine's English names: the same maps as Python's (`python-names.ts`).

import * as names from '../python-names.ts'
import { expect, test } from 'vite-plus/test'
import {
  kindOf,
  levelOf,
  LINK_PREDICATE,
  linkOf,
  targetOf,
  CONSTRAINT_ORDER,
} from '../../src/index.ts'

test('every stored Tipo, level, link and tag group has its English name', () => {
  for (const [pt, en] of Object.entries(names.KINDS))
    expect(kindOf(pt)).toBe(en)
  for (const [pt, en] of Object.entries(names.LEVELS))
    expect(levelOf(pt)).toBe(en)
  expect(
    Object.fromEntries(
      Object.entries(LINK_PREDICATE).map(([en, pt]) => [pt, en]),
    ),
  ).toEqual({ ...names.LINKS, ...names.LATER_LINKS })
  for (const [pt, en] of Object.entries({
    ...names.LINKS,
    ...names.LATER_LINKS,
  }))
    expect(linkOf(pt)).toBe(en)
  for (const [pt, en] of Object.entries(names.TAG_GROUPS))
    expect(targetOf(pt)).toBe(en)
})

test('an id is no tag group, and a predicate outside the links is none', () => {
  expect(targetOf('Q1054574')).toBe('Q1054574')
  expect(targetOf('tt9000104')).toBe('tt9000104')
  expect(linkOf('pais')).toBeUndefined()
  expect(() => kindOf('outro')).toThrow("unknown tipo: 'outro'")
})

test("the Restrições' order is the Python modules', in English, then the ones born after Python left", () => {
  const pythonModules = Object.keys(names.CONSTRAINTS)
    .filter((name) => name !== 'sem_repetido')
    .sort()
  expect([...CONSTRAINT_ORDER]).toEqual([
    ...pythonModules.map(
      (name) => (names.CONSTRAINTS as Record<string, string>)[name],
    ),
    'series_order',
  ])
})
