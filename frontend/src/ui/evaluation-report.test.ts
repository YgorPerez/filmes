// The report as the page reads it: its sections and blocks, the long
// prose in pt-BR, the YAML as the engine wrote it, and the weights back
// as TOML.
import { describe, expect, it } from 'vite-plus/test'
import {
  localize,
  parseReport,
  tidyReport,
  weightsToml,
} from './evaluation-report'

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
- Medida que decide: offline

## Pesos

\`\`\`yaml
path:
  weight:
    cast: 0.375
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
            rows: [['Pessoas', '4', '80% (4/5)']],
          },
          {
            kind: 'paragraph',
            text: 'Parecença média no top 5: Pessoas 0,28. O corte retém os 20% mais recentes.',
          },
        ],
      },
      {
        title: 'Online',
        blocks: [
          {
            kind: 'list',
            items: [
              'Sessões com Feedback na janela: 0',
              'Reação média: 0,67',
              'Medida que decide: o teste com Notas reservadas',
            ],
          },
        ],
      },
      {
        title: 'Pesos',
        blocks: [
          {
            kind: 'code',
            text: 'path:\n  weight:\n    cast: 0.375\nutility:\n  maxEvidence: 5',
          },
        ],
      },
    ])
  })
})

describe('localize', () => {
  it('writes decimals in pt-BR, never a hash, a version or a file', () => {
    expect(localize('0.375 e 0.5 e 2.25 e 80.0%, fim 0.28.')).toBe(
      '0,38 e 0,5 e 2,25 e 80%, fim 0,28.',
    )
    expect(localize('ab12.3456cd 1.2.3456 v1.0 ml-32m/ratings.csv')).toBe(
      'ab12.3456cd 1.2.3456 v1.0 ml-32m/ratings.csv',
    )
  })

  it('says the measure that decides in words', () => {
    expect(localize('Medida que decide: online')).toBe(
      'Medida que decide: o Feedback das Sessões',
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

describe('tidyReport', () => {
  it('gives MovieLens its missing dump in its row, and drops the warning', () => {
    const sections = parseReport(
      [
        '## Offline',
        '| Amostra | Pessoas | Recall@50 |',
        '| --- | ---: | ---: |',
        '| Pessoas | 4 | 80.0% (4/5) |',
        '| MovieLens | 0 | — (0/0) |',
        '## Avisos',
        '- A amostra offline do MovieLens exige ml-32m/ratings.csv no Catálogo.',
      ].join('\n'),
    )
    expect(tidyReport(sections, {})).toEqual([
      {
        title: 'Offline',
        blocks: [
          {
            kind: 'table',
            head: ['Amostra', 'Pessoas', 'Recall@50'],
            align: ['left', 'right', 'right'],
            rows: [
              ['Pessoas', '4', '80% (4/5)'],
              ['MovieLens', 'sem dados: falta o ml-32m no Catálogo'],
            ],
          },
        ],
      },
    ])
  })

  it('calls the grid’s sets of weights combinações, as the page does', () => {
    const sections = parseReport(
      [
        '## Grade de pesos',
        '',
        'Foram testados 411 conjuntos. A ordem usa a média do Recall@50.',
      ].join('\n'),
    )
    expect(tidyReport(sections, {})).toEqual([
      {
        title: 'Grade de pesos',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Foram testadas 411 combinações. A ordem usa a média do Recall@50.',
          },
        ],
      },
    ])
  })
})
