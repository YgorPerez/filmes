import { describe, expect, it } from 'vite-plus/test'
import { tabPlace } from './queue-search'

describe('the place the tabs mark (#274)', () => {
  it('puts another Pessoa’s queue under Pessoas', () => {
    expect(tabPlace('/meu-gosto/fila', { de: 'olga' }, 'bruno')).toBe(
      '/pessoas/olga/fila',
    )
  })

  it('keeps her own queue, and every other page, where it is', () => {
    expect(tabPlace('/meu-gosto/fila', { de: 'bruno' }, 'bruno')).toBe(
      '/meu-gosto/fila',
    )
    expect(tabPlace('/meu-gosto/fila', {}, 'bruno')).toBe('/meu-gosto/fila')
    expect(tabPlace('/meu-gosto', { de: 'olga' }, 'bruno')).toBe('/meu-gosto')
  })
})
