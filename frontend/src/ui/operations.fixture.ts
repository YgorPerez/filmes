// Operações' data for its stories (`operations*.stories.tsx`): the push in
// each state, an idle, a running and a finished evaluation with its report,
// a console answer and the schema.
import type { PushStatus, SchemaTable } from '@filmes/engine'
import type {
  ConsultAnswer,
  EvaluationPanel,
  EvaluationSummary,
  OperationsPage,
} from '#/platform/operations'

export const PUSH_OK: PushStatus = {
  enabled: true,
  pending: 0,
  failures: 0,
  failingSince: null,
  lastError: null,
  alert: false,
  lastPushedAt: '2026-11-20T09:12:00Z',
  queued: [],
}

export const PUSH_FAILING: PushStatus = {
  enabled: true,
  pending: 4,
  failures: 5,
  failingSince: '2026-11-20T10:00:00Z',
  lastError: 'fatal: could not read from remote repository',
  alert: true,
  lastPushedAt: null,
  queued: [
    'Bruno deu nota a Fronteira (2008)',
    'Iara vetou comédia boba',
    'Sessão de 20 nov: Feedback',
  ],
}

export const IDLE: EvaluationPanel = {
  folder: 'ready',
  job: { state: 'idle' },
  report: null,
  previous: null,
}

export const RUNNING: EvaluationPanel = {
  folder: 'ready',
  job: {
    state: 'running',
    by: 'Bruno',
    grid: false,
    startedAt: '2026-11-20T15:00:00.000Z',
    progress: 35.5,
    message: 'Medindo o quanto a lista acerta',
  },
  report: null,
  previous: null,
}

/** A report as the engine writes it, cut short. */
export const REPORT_TEXT = `# Avaliação de 2026-11-20

## Offline

| Amostra | Pessoas | Recall@50 | Cobertura no top 5 |
| --- | ---: | ---: | ---: |
| Pessoas | 4 | 80.0% (4/5) | 70.0% (14/20) |
| MovieLens | 0 | — (0/0) | — (0/0) |

Parecença média no top 5 (quanto menor, mais variada a lista): Pessoas 0.27708333333333335, MovieLens —.

## Online

- Sessões com Feedback na janela: 0
- Medida que decide: offline

## Pesos

\`\`\`yaml
path:
  weight:
    cast: 0.5
    director: 1
utility:
  maxEvidence: 5
\`\`\`

## Avisos

- A amostra offline do MovieLens exige ml-32m/ratings.csv e ml-32m/links.csv no Catálogo.
`

const MEASURES: EvaluationSummary['offline']['people'] = {
  people: 4,
  retrieved: 4,
  heldOut4Plus: 5,
  withEvidence: 14,
  filmsTop5: 20,
  recall50: 0.8,
  coverageTop5: 0.7,
  calibration: {
    overall: {
      weak: { heldOut: 0, hits: 0, hitRate: null },
      moderate: { heldOut: 0, hits: 0, hitRate: null },
      strong: { heldOut: 2, hits: 2, hitRate: 1 },
      none: { heldOut: 5, hits: 3, hitRate: 0.6 },
      rises: null,
    },
    people: {},
  },
  predictedRatingError: {
    films: 0,
    meanAbsoluteError: null,
    rawMeanAbsoluteError: null,
  },
  similarityTop5: 0.28,
}

export const DONE: EvaluationPanel = {
  folder: 'ready',
  job: {
    state: 'done',
    by: 'Bruno',
    grid: true,
    startedAt: '2026-11-20T15:00:00.000Z',
    finishedAt: '2026-11-20T15:04:00.000Z',
    result: {
      date: '2026-11-20',
      offline: {
        people: MEASURES,
        movielens: {
          ...MEASURES,
          people: 0,
          recall50: null,
          coverageTop5: null,
        },
      },
      online: {
        sessions: 0,
        withFilm: 0,
        chosenTop5: 0,
        rateTop5: null,
        reactions: 0,
        meanReaction: null,
        satisfaction: {
          people: {},
          groupSessions: 0,
          minimum: null,
          disagreement: null,
        },
      },
      priority: 'offline',
      warnings: [
        'A amostra offline do MovieLens exige ml-32m/ratings.csv e ml-32m/links.csv no Catálogo.',
      ],
      best: [
        {
          recall50: 0.8,
          coverageTop5: 0.7,
          changes: [],
          tie: true,
        },
        {
          recall50: 0.8,
          coverageTop5: 0.7,
          changes: [
            { section: 'path.weight', key: 'cast', from: 0.5, to: 0.625 },
          ],
          tie: true,
        },
        {
          recall50: 0.75,
          coverageTop5: 0.7,
          changes: [
            {
              section: 'rating_decay',
              key: 'half_life_years',
              from: 5,
              to: 10,
            },
          ],
          tie: false,
        },
      ],
      combinations: 411,
      file: '2026-11-20.md',
    },
  },
  report: { date: '2026-11-20', text: REPORT_TEXT },
  previous: { date: '2026-11-13', recall50: 0.75 },
}

export const SCHEMA: SchemaTable[] = [
  {
    name: 'filmes',
    kind: 'table',
    columns: ['id', 'titulo', 'ano', 'duracao_min', 'votos'],
  },
  {
    name: 'notas_vigentes',
    kind: 'view',
    columns: ['fato_id', 'pessoa', 'filme_id', 'nota', 'data'],
  },
]

export const CONSULT: Extract<ConsultAnswer, { total: number }> = {
  sql: 'SELECT slug, apelido FROM pessoas',
  columns: [
    { key: 'c0', name: 'slug' },
    { key: 'c1', name: 'apelido' },
  ],
  rows: [
    {
      key: 'r0',
      cells: [
        { key: 'c0', value: 'bruno' },
        { key: 'c1', value: null },
      ],
    },
    {
      key: 'r1',
      cells: [
        { key: 'c0', value: 'iara' },
        { key: 'c1', value: 7 },
      ],
    },
  ],
  total: 250,
  limit: 200,
}

export const PAGE: OperationsPage = {
  push: PUSH_OK,
  evaluation: IDLE,
  consult: null,
  schema: SCHEMA,
}

/** The evaluation's next read: the run never ends in a story. */
export const pending = () => new Promise<EvaluationPanel>(() => {})
