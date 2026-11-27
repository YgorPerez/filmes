// The Feedback form's loader: a page without `?nota=` has no draft.
import { expect, it } from 'vite-plus/test'
import { feedbackDraftFor } from './feedback'

it('a Feedback form without a note has no draft', async () => {
  expect(await feedbackDraftFor(undefined)).toBeNull()
})
