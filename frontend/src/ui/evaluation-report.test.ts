// The report as the page reads it: its sections and blocks, the long
// numbers cut, and the weights back as TOML.
import { describe, expect, it } from 'vite-plus/test'
import { parseReport, roundNumbers, weightsToml } from './evaluation-report'

const REPORT = `# Avaliação de 2026-11-20

## Offline

| Amostra | Pessoas | Recall@50 |
| --- | ---: | :---: |
| Pessoas | 4 | 80.0% (4/5) |

Parecença média no top 5: Pessoas 0.27708333333333335.
O corte retém os 20% mais recentes.

## Online

- Sessões com Feedback na janela: 0
- Reação média: 0.6666666666666666

## Pesos

\`\`\`yaml
path:
  weight:
    cast: 0.5
utility:
  maxEvidence: 5
\`\`\`
`

describe('parseReport', () => {
  it('splits the ## sections into tables, paragraphs, lists and code', () => {
    expect(parseReport(REPORT)).toEqual([
      {
        title: 'Offline',
        blocks: [
          {
            kind: 'table',
            head: ['Amostra', 'Pessoas', 'Recall@50'],
            align: ['left', 'right', 'center'],
            rows: [['Pessoas', '4', '80.0% (4/5)']],
          },
          {
            kind: 'paragraph',
            text: 'Parecença média no top 5: Pessoas 0.28. O corte retém os 20% mais recentes.',
          },
        ],
      },
      {
        title: 'Online',
        blocks: [
          {
            kind: 'list',
            items: ['Sessões com Feedback na janela: 0', 'Reação média: 0.67'],
          },
        ],
      },
      {
        title: 'Pesos',
        blocks: [
          {
            kind: 'code',
            text: 'path:\n  weight:\n    cast: 0.5\nutility:\n  maxEvidence: 5',
          },
        ],
      },
    ])
  })
})

describe('roundNumbers', () => {
  it('cuts only long decimals, never a hash or a version', () => {
    expect(roundNumbers('0.375 e 0.5 e 2.25')).toBe('0.38 e 0.5 e 2.25')
    expect(roundNumbers('ab12.3456cd 1.2.3456 v1.0')).toBe(
      'ab12.3456cd 1.2.3456 v1.0',
    )
  })
})

describe('weightsToml', () => {
  it('gives the weights back as config/weights.toml writes them', () => {
    expect(
      weightsToml(
        "path:\n  weight:\n    cast: 0.5\n    genre: 0.3\nutility:\n  maxEvidence: 5\nmood:\n  name: 'leve'",
      ),
    ).toBe(
      '[path.weight]\ncast = 0.5\ngenre = 0.3\n\n[utility]\nmax_evidence = 5\n\n[mood]\nname = "leve"',
    )
  })

  it('reads no list', () => {
    expect(weightsToml('moods:\n  - leve')).toBeNull()
  })
})
