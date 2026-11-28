// The words Operações builds from the evaluation and the console: the
// verdict, the change since the report before, the Feedback of the Sessões,
// the weights a better combination changes, the rows a query returned.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'
import { OPERATIONS } from './operations.copy'

const COPY = OPERATIONS.evaluation

describe('the Operações copy', () => {
  it('says how much of the queue it lists', () => {
    expect(OPERATIONS.push.pendingList(12, 5)).toBe(
      '12 commits na fila. Os 5 mais recentes:',
    )
    expect(OPERATIONS.push.pendingList(3, 3)).toBe('3 commits na fila:')
  })

  it('says who started which run and how long it takes', () => {
    expect(COPY.startedBy('Bruno', '2026-11-20T12:00:00Z', true)).toMatch(
      /^Bruno iniciou a comparação de pesos em .*alguns minutos\.$/u,
    )
    expect(COPY.startedBy('Bruno', '2026-11-20T12:00:00Z', false)).toMatch(
      /^Bruno iniciou a avaliação em .*cerca de 1 minuto\.$/u,
    )
  })

  it('writes the verdict with or without a measure, for one or many', () => {
    expect(COPY.verdict(null, 1)).toBe(
      'Sem medida: nenhuma Nota alta reservada entre 1 Pessoa.',
    )
    expect(COPY.verdict(null, 3)).toBe(
      'Sem medida: nenhuma Nota alta reservada entre 3 Pessoas.',
    )
    expect(COPY.verdict(0.5, 1)).toBe(
      'A lista acerta 50% das Notas altas reservadas, com 1 Pessoa.',
    )
  })

  it('says the change since the report before, up, down or none', () => {
    expect(COPY.delta(0.4, 0.4, '2026-11-13')).toBe('Igual à de 13 nov 2026.')
    expect(COPY.delta(0.39, 0.4, '2026-11-13')).toBe(
      '−1 ponto desde 13 nov 2026.',
    )
    expect(COPY.delta(0.3, 0.4, '2026-11-13')).toBe(
      '−10 pontos desde 13 nov 2026.',
    )
  })

  it('tells the Feedback of the Sessões and which test weighs more', () => {
    expect(COPY.online(0, null)).toBe('Nenhuma Sessão com Feedback.')
    expect(COPY.online(1, null)).toBe(
      'Feedback de 1 Sessão. Sem taxa de escolha no top 5.',
    )
    expect(COPY.online(4, 0.25)).toBe(
      'Feedback de 4 Sessões. O filme escolhido estava no top 5 em 25% delas.',
    )
    expect(COPY.priority('online')).toMatch(/^Já há Sessões suficientes/u)
    expect(COPY.priority('offline')).toMatch(/^Ainda há poucas Sessões/u)
  })
})

/** The keys of `[path.weight]` in `config/weights.toml`, which the grid
 * varies every one of. */
const pathWeightKeys = () => {
  const toml = readFileSync(
    new URL('../../../config/weights.toml', import.meta.url),
    'utf8',
  )
  const section = toml.split(/^\[path\.weight\]$/mu)[1]?.split(/^\[/mu)[0]
  return [...(section ?? '').matchAll(/^(\w+)\s*=/gmu)].map((m) => m[1]!)
}

describe('the Operações copy, weights and rows', () => {
  it('names every weight of the content path the grid can change', () => {
    const keys = pathWeightKeys()
    expect(keys).toContain('cinematography')
    expect(keys).toContain('producer')
    for (const key of keys)
      expect(
        COPY.change({ section: 'path.weight', key, from: 1, to: 0.75 }),
      ).not.toMatch(/^path\.weight\./u)
    expect(
      COPY.change({
        section: 'path.weight',
        key: 'cinematography',
        from: 0.5,
        to: 0.375,
      }),
    ).toBe('fotografia 0,5 → 0,375')
  })

  it('names a weight it knows and writes the key of one it does not', () => {
    expect(
      COPY.change({
        section: 'path.weight',
        key: 'cast',
        from: 0.5,
        to: 0.625,
      }),
    ).toBe('elenco 0,5 → 0,625')
    expect(
      COPY.change({ section: 'bet', key: 'floor', from: null, to: 2 }),
    ).toBe('bet.floor — → 2')
    expect(
      COPY.toml([
        { section: 'bet', key: 'floor', from: null, to: 2 },
        { section: 'path.weight', key: 'cast', from: 0.5, to: 0.625 },
        { section: 'bet', key: 'ceiling', from: 1, to: 3 },
      ]),
    ).toBe('[bet]\nfloor = 2\nceiling = 3\n\n[path.weight]\ncast = 0.625')
  })

  it('counts the rows a query returned', () => {
    expect(OPERATIONS.consult.rows(5000, 1000)).toBe(
      'Mostrando as primeiras 1.000 de 5.000 linhas. Use LIMIT e OFFSET para ver o resto.',
    )
    expect(OPERATIONS.consult.rows(1, 1)).toBe('1 linha.')
    expect(OPERATIONS.consult.rows(1200, 1200)).toBe('1.200 linhas.')
  })
})
