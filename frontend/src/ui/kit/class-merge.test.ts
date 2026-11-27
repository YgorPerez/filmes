import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'
import { mergeClasses, TOKENS } from './class-merge'

const tokens = readFileSync(new URL('../tokens.css', import.meta.url), 'utf8')
const declared = (scale: string) =>
  new Set(
    [...tokens.matchAll(new RegExp(`^\\s+--${scale}-([a-z0-9-]+):`, 'gm'))]
      .map((m) => m[1])
      .filter((name) => !name.includes('--')),
  )

describe('class merge', () => {
  it.each(Object.keys(TOKENS) as (keyof typeof TOKENS)[])(
    'knows every %s token of tokens.css',
    (scale) => {
      expect(new Set(TOKENS[scale])).toEqual(declared(scale))
    },
  )

  it('lets a later class replace a height and a padding', () => {
    const classes = mergeClasses(
      'inline-flex min-h-touch rounded-pill px-xl font-display text-control',
      'min-h-[64px] px-0',
    ).split(' ')
    expect(classes).toContain('min-h-[64px]')
    expect(classes).not.toContain('min-h-touch')
    expect(classes).toContain('px-0')
    expect(classes).not.toContain('px-xl')
  })

  it('tells a type size from a colour', () => {
    expect(mergeClasses('text-control text-ink', 'text-meta')).toBe(
      'text-ink text-meta',
    )
    expect(mergeClasses('text-ink', 'text-ink-2')).toBe('text-ink-2')
  })
})
