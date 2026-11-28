// @vitest-environment jsdom
// The edit form of an open Session (#372): filled with the current
// version, posting to its route, and the pages with no form.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vite-plus/test'
import { SessionEditScreen } from './session-edit'
import { SESSION_EDIT } from './session-edit.copy'
import { SESSIONS } from './sessions.copy'

afterEach(cleanup)

const ID = '2026-11-20-iara'
const PAGE = {
  id: ID,
  fields: {
    request: 'algo bom',
    moods: ['leve'],
    maxDuration: 120,
    noSlow: true,
    similar: ['tt9006701'],
  },
  moods: ['leve', 'tenso'],
}

it('is filled with the current version and posts to the Session’s edit', () => {
  render(<SessionEditScreen id={ID} page={PAGE} />)
  const form = screen.getByRole('form', { name: SESSION_EDIT.label })
  expect(form.getAttribute('action')).toBe(`/sessoes/${ID}/pedido/enviar`)
  expect(screen.getByLabelText(new RegExp(SESSION_EDIT.words))).toHaveProperty(
    'value',
    'algo bom',
  )
  expect(
    screen.getByLabelText(new RegExp(SESSIONS.form.duration)),
  ).toHaveProperty('value', '120')
  expect(
    screen.getByRole('checkbox', { name: SESSIONS.form.noSlow }),
  ).toHaveProperty('checked', true)
  expect(
    screen.getByLabelText(new RegExp(SESSIONS.form.similar)),
  ).toHaveProperty('value', 'tt9006701')
  expect(screen.getByRole('link', { name: SESSION_EDIT.back })).toHaveProperty(
    'pathname',
    `/sessoes/${ID}`,
  )
})

it('says why the form was refused', () => {
  render(<SessionEditScreen id={ID} page={PAGE} refusal="ausente" />)
  expect(screen.getByText(SESSION_EDIT.refusals.ausente)).toBeTruthy()
})

it('has no form for a told Session, a Dono who was not there or none', () => {
  for (const [page, text] of [
    ['closed', SESSION_EDIT.closed],
    ['absent', SESSION_EDIT.absent],
    ['unknown', SESSION_EDIT.unknown],
    [null, SESSIONS.unavailable],
  ] as const) {
    render(<SessionEditScreen id={ID} page={page} />)
    expect(screen.getByText(text)).toBeTruthy()
    expect(screen.queryByRole('form')).toBeNull()
    cleanup()
  }
})
