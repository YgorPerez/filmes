// The served tools, in the order `tools/list` shows them. A new tool is a
// file in this folder and a line here.

import type { Tool } from '../tool.ts'
import answerBillboard from './answer-billboard.ts'
import billboard from './billboard.ts'
import consult from './consult.ts'
import deleteSession from './delete-session.ts'
import editAttendees from './edit-attendees.ts'
import editSessionRequest from './edit-session-request.ts'
import evaluate from './evaluate.ts'
import exportTool from './export.ts'
import importQueue from './import-queue.ts'
import importTool from './import.ts'
import openSessions from './open-sessions.ts'
import person from './person.ts'
import recommend from './recommend.ts'
import recordFeedback from './record-feedback.ts'
import searchCatalog from './search-catalog.ts'
import verifyAnswer from './verify-answer.ts'

export const TOOLS: ReadonlyArray<Tool> = [
  openSessions,
  recommend,
  billboard,
  answerBillboard,
  verifyAnswer,
  recordFeedback,
  editAttendees,
  editSessionRequest,
  deleteSession,
  searchCatalog,
  person,
  importTool,
  importQueue,
  exportTool,
  consult,
  evaluate,
] as ReadonlyArray<Tool>
