// `40_sessoes`: every Session file, with its Feedback Fatos.

import { Effect } from 'effect'
import { loadSessions } from '../../sessions/database.ts'
import type { Step } from './Step.ts'

export const sessions: Step = {
  name: '40_sessoes',
  load: (db) => Effect.asVoid(loadSessions(db)),
}
