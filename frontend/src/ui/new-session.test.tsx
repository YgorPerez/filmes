// @vitest-environment jsdom
// The "Nova Sessão" form as the Dono fills it: what it posts is what the
// server reads (`parseSessionRequest`, the same reader the route uses).
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import {
  parseSessionRequest,
  SESSION_REQUEST_REFUSALS,
} from '#/content/session-request'
import type { RequestOptions } from '#/platform/sessions'
import { NewSession } from './sessions'
import { SESSIONS } from './sessions.copy'

afterEach(cleanup)

const OPTIONS: RequestOptions = {
  people: [
    { person: 'bruno', name: 'Bruno', owner: true },
    { person: 'iara', name: 'Iara', owner: false },
    { person: 'quim', name: 'Quim', owner: false },
  ],
  moods: ['leve', 'pra rir', 'tenso'],
}

function show() {
  render(<NewSession options={OPTIONS} />)
  const form = screen.getByRole('form', { name: SESSIONS.form.label })
  return { user: userEvent.setup(), form: form as HTMLFormElement }
}

const posted = (form: HTMLFormElement) => {
  expect(form.method).toBe('post')
  expect(new URL(form.action).pathname).toBe('/sessoes/nova/enviar')
  return parseSessionRequest(new FormData(form))
}

const { form: copy } = SESSIONS

describe('the Nova Sessão form', () => {
  it('asks for the Dono alone with the padrão Regra by default', () => {
    const { form } = show()
    expect(posted(form)).toEqual({
      ok: { attendees: ['bruno'], rule: 'default', moods: [] },
    })
  })

  it('posts the Presentes, the Regra, the Climas and every Restrição', async () => {
    const { user, form } = show()
    await user.click(screen.getByRole('checkbox', { name: 'Iara' }))
    await user.click(screen.getByRole('radio', { name: copy.rules.de }))
    await user.selectOptions(
      screen.getByRole('combobox', { name: /^De quem/ }),
      'iara',
    )
    await user.click(screen.getByRole('checkbox', { name: 'pra rir' }))
    await user.type(screen.getByLabelText(copy.count, { exact: false }), '3')
    await user.type(
      screen.getByLabelText(copy.words, { exact: false }),
      'só nós',
    )
    await user.type(
      screen.getByLabelText(copy.duration, { exact: false }),
      '100',
    )
    await user.type(screen.getByLabelText(copy.since, { exact: false }), '1980')
    await user.type(screen.getByLabelText(copy.until, { exact: false }), '2000')
    await user.type(
      screen.getByLabelText(copy.language, { exact: false }),
      'pt',
    )
    await user.selectOptions(screen.getByLabelText(copy.child), '7')
    await user.type(
      screen.getByLabelText(copy.triggers, { exact: false }),
      'animal morre',
    )
    await user.type(
      screen.getByLabelText(copy.similar, { exact: false }),
      'tt9000101',
    )
    await user.click(screen.getByRole('checkbox', { name: /Nenhum Já visto/ }))
    await user.click(screen.getByRole('checkbox', { name: copy.noSlow }))
    await user.click(screen.getByRole('checkbox', { name: copy.noSad }))

    expect(posted(form)).toEqual({
      ok: {
        attendees: ['bruno', 'iara'],
        rule: 'by',
        by: 'iara',
        moods: ['pra rir'],
        count: 3,
        request: 'só nós',
        maxDuration: 100,
        since: 1980,
        until: 2000,
        language: 'pt',
        child: 7,
        triggers: ['animal morre'],
        similar: ['tt9000101'],
        unseen: true,
        noSlow: true,
        noSad: true,
      },
    })
  })

  it('offers a child with no age (only “livre”)', async () => {
    const { user, form } = show()
    await user.selectOptions(screen.getByLabelText(copy.child), '0')
    expect(posted(form)).toMatchObject({ ok: { child: 0 } })
  })

  it('refuses “o gosto de uma Pessoa” for someone who is not a Presente', async () => {
    const { user, form } = show()
    await user.click(screen.getByRole('radio', { name: copy.rules.de }))
    await user.selectOptions(
      screen.getByRole('combobox', { name: /^De quem/ }),
      'quim',
    )
    expect(posted(form)).toEqual({ refused: 'de' })
  })

  it('refuses no Presente', async () => {
    const { user, form } = show()
    await user.click(screen.getByRole('checkbox', { name: /Bruno/ }))
    expect(posted(form)).toEqual({ refused: 'presentes' })
  })

  it('refuses a title in “parecido com”', async () => {
    const { user, form } = show()
    await user.type(
      screen.getByLabelText(copy.similar, { exact: false }),
      'Casa Cheia',
    )
    expect(posted(form)).toEqual({ refused: 'parecido' })
  })

  it.each(SESSION_REQUEST_REFUSALS)('says why it refused %s', (refusal) => {
    render(<NewSession options={OPTIONS} refusal={refusal} />)
    expect(screen.getByRole('alert').textContent).toContain(
      SESSIONS.refusals[refusal],
    )
  })

  it('says when the engine cannot run here', () => {
    render(<NewSession options={null} />)
    expect(screen.getByRole('alert').textContent).toContain(
      SESSIONS.unavailable,
    )
    expect(screen.queryByRole('form')).toBeNull()
  })
})
