// The served tools, in the order `tools/list` shows them. A new tool is a
// file in this folder and a line here.

import type { Tool } from '../tool.ts'
import answerBillboard from './answer-billboard.ts'
import billboard from './billboard.ts'
import openSessions from './open-sessions.ts'
import recommend from './recommend.ts'
import recordFeedback from './record-feedback.ts'
import verifyAnswer from './verify-answer.ts'

export const TOOLS: ReadonlyArray<Tool> = [
  openSessions,
  recommend,
  billboard,
  answerBillboard,
  verifyAnswer,
  recordFeedback,
] as ReadonlyArray<Tool>
