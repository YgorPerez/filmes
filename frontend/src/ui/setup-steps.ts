// Where each step of the setup guide stands, for the home (`home-parts.tsx`)
// and Meu gosto (`my-start.tsx`). Code, not a component: it stays out of the
// component files, as Fast Refresh needs.
//
// The guide shows two steps (#271): Meu gosto, done by 10 Notas or by an
// import, and the connector. The engine still keeps a third, the import,
// whose "done" already makes Meu gosto done; the screens leave it out.

/** What this file reads of a step (`SetupStepView`) and of the guide. */
type Step<K extends string = string> = {
  readonly step: K
  readonly done: boolean
  readonly skipped: boolean
}
type Setup<K extends string = string> = { readonly steps: readonly Step<K>[] }

/** A step the guide shows. */
export type GuideStep = Step<'taste' | 'connector'>

const shown = <K extends string>(step: Step<K>): step is Step<K> & GuideStep =>
  step.step === 'taste' || step.step === 'connector'

/** The steps the guide shows, in order. */
export const guideSteps = <K extends string>(setup: Setup<K>): GuideStep[] =>
  setup.steps.filter(shown)

/** Done wins over skipped: a step she skipped and did anyway is done. */
export const stateOf = (step: Step): 'done' | 'skipped' | 'pending' =>
  step.done ? 'done' : step.skipped ? 'skipped' : 'pending'

/** A step is pending: the home shows the guide. Skipped does not count. */
export const isGuiding = (setup: Setup) =>
  guideSteps(setup).some((s) => stateOf(s) === 'pending')

/** A step she skipped and has not done: Meu gosto resumes it from here
 * once the home has no guide. */
export const isSkipped = (step: Step) => stateOf(step) === 'skipped'
