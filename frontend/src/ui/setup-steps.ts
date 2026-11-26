// Where each step of the setup guide stands, for the home (`home-parts.tsx`)
// and Meu gosto (`my-start.tsx`). Code, not a component: it stays out of the
// component files, as Fast Refresh needs.

/** What this file reads of a step (`SetupStepView`) and of the guide. */
type Step = { readonly done: boolean; readonly skipped: boolean }
type Setup = { readonly steps: readonly Step[] }

/** Done wins over skipped: a step she skipped and did anyway is done. */
export const stateOf = (step: Step): 'done' | 'skipped' | 'pending' =>
  step.done ? 'done' : step.skipped ? 'skipped' : 'pending'

/** A step is pending: the home shows the guide. Skipped does not count. */
export const isGuiding = (setup: Setup) =>
  setup.steps.some((s) => stateOf(s) === 'pending')

/** A step she skipped and has not done: Meu gosto resumes it from here
 * once the home has no guide. */
export const isSkipped = (step: Step) => stateOf(step) === 'skipped'
