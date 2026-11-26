// The evaluation run's key, for Operações (`operations.tsx`). Code, not a
// component: it stays out of the component files, as Fast Refresh needs.
import type { EvaluationJob } from '#/platform/operations'

/** A key that changes with each run, so a page loaded after a new run
 * starts from the loader's panel. */
export const jobKey = (job: EvaluationJob) =>
  job.state === 'idle' ? 'idle' : job.startedAt
