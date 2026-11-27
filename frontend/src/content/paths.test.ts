// Which tab the bar marks for a page (#348).
import { describe, expect, it } from 'vite-plus/test'
import { QUEUE_PATH, tabPath } from './paths'

describe('tabPath', () => {
  it('marks Pessoas on another Pessoa’s queue, Meu gosto on her own', () => {
    expect(tabPath(QUEUE_PATH, { de: 'olga' }, 'bruno')).toBe('/pessoas')
    expect(tabPath(QUEUE_PATH, { de: 'bruno' }, 'bruno')).toBe(QUEUE_PATH)
    expect(tabPath(QUEUE_PATH, {}, 'bruno')).toBe(QUEUE_PATH)
    // Only the queue reads `de`.
    expect(tabPath('/meu-gosto/notas', { de: 'olga' }, 'bruno')).toBe(
      '/meu-gosto/notas',
    )
  })
})
