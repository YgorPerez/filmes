// The Feedback form's loader: a page without `?nota=` has no draft.
import { expect, it } from 'vite-plus/test'
import { feedbackDraftFor, withCorrection } from './feedback'

it('a Feedback form without a note has no draft', async () => {
  expect(await feedbackDraftFor(undefined)).toBeNull()
})

it('without a correction, the open page and what the search kept', () => {
  expect(withCorrection('open', null, null, undefined)).toEqual({
    page: 'open',
    draft: null,
    noted: false,
    correcting: false,
  })
  expect(withCorrection('unknown', { a: 1 }, 'unknown', undefined)).toEqual({
    page: 'unknown',
    draft: { a: 1 },
    noted: true,
    correcting: false,
  })
})

it('a correction gives its page, what was told and the film told (#344)', () => {
  const told = { page: 'told', film: 'tt1', draft: { bruno: 'nota:9' } }
  expect(withCorrection('unknown', null, told, undefined)).toEqual({
    page: 'told',
    draft: { bruno: 'nota:9' },
    noted: false,
    correcting: true,
    film: 'tt1',
    nothing: false,
  })
  // What the search kept, and the film it picked, win.
  expect(
    withCorrection('unknown', { bruno: 'nota:3' }, told, 'tt2'),
  ).toMatchObject({
    draft: { bruno: 'nota:3' },
    noted: true,
    film: 'tt2',
  })
  // "Não vimos nada" told comes marked.
  expect(
    withCorrection('unknown', null, { ...told, film: null }, undefined),
  ).toMatchObject({ film: undefined, nothing: true })
})
