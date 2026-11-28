// The Pessoas list's query: the refusals and the one notice it reads.
import { expect, it } from 'vite-plus/test'
import { isPeopleNotice, isPeopleRefusal } from './people-search'

it('knows its refusals and its one notice', () => {
  expect(isPeopleRefusal('pessoa')).toBe(true)
  expect(isPeopleRefusal('baixar')).toBe(true)
  expect(isPeopleRefusal('outra')).toBe(false)
  expect(isPeopleNotice('removida')).toBe(true)
  expect(isPeopleNotice('gravado')).toBe(false)
})
