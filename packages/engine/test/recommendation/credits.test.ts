// The credits page's list (#292): every source the engine reads, with the
// wording its terms require, once, so the cards carry none.
import { describe, expect, test } from 'vite-plus/test'
import { attributionsOf, CREDITS } from '../../src/index.ts'

const named = (source: string) => {
  const credit = CREDITS.find((c) => c.source === source)
  if (!credit) throw new Error(`no credit for ${source}`)
  return credit
}

describe('the credits', () => {
  test('carry every attribution a Recommendation can return, word for word', () => {
    const every = attributionsOf([
      'IMDb',
      'TMDB',
      'Does the Dog Die',
      'Tag Genome',
      'Trakt da Ana',
    ])
    expect(every).toHaveLength(5)
    for (const { source, text } of every)
      expect(named(source).notice).toBe(text)
  })

  test('name each source the engine reads, once, with its page', () => {
    const sources = CREDITS.map((c) => c.source)
    expect(sources).toEqual([
      'IMDb',
      'TMDB',
      'Wikidata',
      'MovieLens',
      'Tag Genome',
      'OMDb',
      'Does the Dog Die',
      'Trakt',
      'Letterboxd',
    ])
    for (const { url, use } of CREDITS) {
      expect(url).toMatch(/^https:\/\//)
      expect(use).not.toBe('')
    }
  })

  test('OMDb and MovieLens get what their licenses ask', () => {
    expect(named('OMDb').notice).toContain('CC BY-NC 4.0')
    expect(named('MovieLens').notice).toContain('não endossa')
    expect(named('Wikidata').notice).toContain('CC0')
    expect(named('Letterboxd').notice).toBeNull()
  })
})
