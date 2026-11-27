import { describe, expect, it } from 'vite-plus/test'
import { shortDate, weekdayDate } from './dates'

describe('shortDate', () => {
  it('writes the day, the month and the year in PT-BR', () => {
    expect(shortDate('2025-06-01')).toBe('1 jun 2025')
    expect(shortDate('2026-11-20T22:10:00Z')).toBe('20 nov 2026')
  })

  it('leaves the current year out', () => {
    expect(shortDate('2026-11-20', 2026)).toBe('20 nov')
    expect(shortDate('2025-12-31', 2026)).toBe('31 dez 2025')
  })

  it('gives back what is not a date', () => {
    expect(shortDate('ontem')).toBe('ontem')
    expect(shortDate('2026-13-01')).toBe('2026-13-01')
  })
})

describe('weekdayDate', () => {
  it('names the weekday', () => {
    expect(weekdayDate('2026-11-20')).toBe('sex, 20 nov')
    expect(weekdayDate('2026-11-22')).toBe('dom, 22 nov')
    expect(weekdayDate('x')).toBe('x')
  })
})
