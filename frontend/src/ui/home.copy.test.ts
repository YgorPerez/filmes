// The words of the home's latest Sessão: its day counted from today and
// who was there.
import { describe, expect, it } from 'vite-plus/test'
import { HOME } from './home.copy'

const { when, againWhat } = HOME.latest

describe('the home copy', () => {
  it('counts the Sessão’s day from today', () => {
    const today = '2026-11-20'
    expect(when('2026-11-20', today, ['Você'])).toBe('Hoje · Você')
    expect(when('2026-11-19', today, ['Você', 'Teo'])).toBe(
      'Ontem · Você e Teo',
    )
    expect(when('2026-11-17', today, ['Você', 'Teo', 'Ana'])).toBe(
      'Terça · Você, Teo e Ana',
    )
    expect(when('2026-11-06', today, [])).toBe('Sexta, 6 nov · ')
  })

  it('without a today to count from, writes the weekday and the date', () => {
    expect(when('2026-11-20', null, ['Você'])).toBe('Sexta, 20 nov · Você')
    expect(when('2026-11-20', 'ontem', ['Você'])).toBe('Sexta, 20 nov · Você')
  })

  it('a day that is not a date stays as it came', () => {
    expect(when('sem-data', null, ['Você'])).toBe('sem-data · Você')
    expect(when('100000000000000000000-01-01', null, ['Você'])).toBe(
      '100000000000000000000-01-01 · Você',
    )
  })

  it('writes the request to ask again and the Notas done', () => {
    expect(againWhat(['Você', 'Teo'], ['até 2h', 'leve'])).toBe(
      'Você e Teo, até 2h, leve',
    )
    expect(HOME.guide.doneRatings(1)).toBe('feito, 1 nota')
    expect(HOME.guide.doneRatings(12)).toBe('feito, 12 notas')
  })
})
