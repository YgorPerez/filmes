// Operações' data for its stories (`operations*.stories.tsx`): the push in
// each state, an idle and a running evaluation, and a console answer.
import type { PushStatus } from '@filmes/engine'
import type {
  ConsultAnswer,
  EvaluationPanel,
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
}

export const RUNNING: EvaluationPanel = {
  folder: 'ready',
  job: {
    state: 'running',
    by: 'Bruno',
    grid: false,
    startedAt: '2026-11-20T15:00:00.000Z',
    progress: 35.5,
    message: 'Medindo recall e cobertura',
  },
  report: null,
}

export const CONSULT: ConsultAnswer = {
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
}

export const PAGE: OperationsPage = {
  push: PUSH_OK,
  evaluation: IDLE,
  consult: null,
}

/** The evaluation's next read: the run never ends in a story. */
export const pending = () => new Promise<EvaluationPanel>(() => {})
