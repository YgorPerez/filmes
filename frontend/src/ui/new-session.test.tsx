// @vitest-environment jsdom
// The "Nova Sessão" form as the Dono fills it: what it posts is what the
// server reads (`parseSessionRequest`, the same reader the route uses).
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import {
  parseSessionRequest,
  SESSION_REQUEST_REFUSALS,
} from '#/content/session-request'
import { CATALOG_SEARCH } from './catalog-search.copy'
import { NewSession } from './new-session'

// The screen's own props: the test leaves the server module alone.
type Props = ComponentProps<typeof NewSession>
type RequestOptions = NonNullable<Props['options']>
type NewSessionDraft = NonNullable<Props['draft']>
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
})

describe('the Nova Sessão form, what it posts', () => {
  it('posts the Presentes, the Regra, the Climas and every Restrição', async () => {
    const { user, form } = show()
    await user.click(screen.getByRole('checkbox', { name: 'Iara' }))
    await user.click(screen.getByText(copy.details))
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
    await user.click(screen.getByRole('checkbox', { name: copy.unseen }))
    await user.click(screen.getByRole('checkbox', { name: copy.noSlow }))
    await user.click(screen.getByRole('checkbox', { name: copy.noSad }))
    await user.type(screen.getByLabelText(copy.noMoods, { exact: false }), 'tenso')
    await user.click(
      screen.getByRole('radio', { name: copy.seriesOrders.todos }),
    )

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
        unseen: true,
        noSlow: true,
        noSad: true,
        noMoods: ['tenso'],
        seriesOrder: 'all',
      },
    })
  })
})

describe('the Nova Sessão form, the Série and refusals', () => {
  it('starts the Série na ordem at its default, marked, and offers the other two', async () => {
    const { user, form } = show()
    await user.click(screen.getByText(copy.details))
    const group = screen.getByRole('region', { name: copy.seriesOrder })
    const radios = within(group).getAllByRole('radio')

    expect(radios.map((r) => r.closest('label')?.textContent)).toEqual([
      `${copy.seriesOrders.anterior} · ${copy.seriesOrderDefault}`,
      copy.seriesOrders.todos,
      copy.seriesOrders['tanto-faz'],
    ])
    expect(radios.map((r) => (r as HTMLInputElement).checked)).toEqual([
      true,
      false,
      false,
    ])
    await user.click(
      screen.getByRole('radio', { name: copy.seriesOrders['tanto-faz'] }),
    )
    expect(posted(form)).toMatchObject({ ok: { seriesOrder: 'off' } })
  })

  it('offers a child with no age (only “livre”)', async () => {
    const { user, form } = show()
    await user.click(screen.getByText(copy.details))
    await user.selectOptions(screen.getByLabelText(copy.child), '0')
    expect(posted(form)).toMatchObject({ ok: { child: 0 } })
  })

  it('refuses “o gosto de uma Pessoa” for someone who is not a Presente', async () => {
    const { user, form } = show()
    await user.click(screen.getByText(copy.details))
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

  it.each(SESSION_REQUEST_REFUSALS)('says why it refused %s', (refusal) => {
    render(<NewSession options={OPTIONS} refusal={refusal} />)
    expect(screen.getByRole('alert').textContent).toContain(
      SESSIONS.refusals[refusal],
    )
  })
})

describe('the Nova Sessão form, its start', () => {
  it('starts with the Presentes of “Pedir filme de novo com essa turma”', () => {
    render(<NewSession options={OPTIONS} attendees={['iara', 'quim']} />)
    const form = screen.getByRole('form', { name: SESSIONS.form.label })
    expect(posted(form as HTMLFormElement)).toEqual({
      ok: { attendees: ['iara', 'quim'], rule: 'default', moods: [] },
    })
  })

  it('says when the engine cannot run here', () => {
    render(<NewSession options={null} />)
    expect(screen.getByRole('alert').textContent).toContain(
      SESSIONS.unavailable,
    )
    expect(screen.queryByRole('form')).toBeNull()
  })
})

describe('the Catálogo search', () => {
  it('adds the film the Catálogo search found to “parecido com”, in place', async () => {
    const search = {
      query: 'mare',
      found: {
        query: 'mare',
        films: [
          {
            id: 'tt9000102',
            title: 'Maré Baixa',
            year: 2015,
            votes: 32000,
            rating: null,
            directors: ['Helena Prado'],
          },
        ],
        people: [],
        genres: [],
        series: [],
      },
    }
    render(<NewSession options={OPTIONS} search={search} similar="tt9000101" />)
    const form = screen.getByRole('form', {
      name: SESSIONS.form.label,
    }) as HTMLFormElement
    const user = userEvent.setup()

    await user.click(
      screen.getByRole('button', { name: 'Usar Maré Baixa (2015)' }),
    )
    expect(posted(form)).toMatchObject({
      ok: { similar: ['tt9000101', 'tt9000102'] },
    })
    // Taken twice, it is still one film; its × lets it go.
    await user.click(
      screen.getByRole('button', { name: 'Usar Maré Baixa (2015)' }),
    )
    await user.click(
      screen.getByRole('button', {
        name: CATALOG_SEARCH.remove('Maré Baixa (2015)'),
      }),
    )
    expect(new FormData(form).get('parecido')).toBe('tt9000101')
  })

  it('starts “parecido com” with no search', () => {
    render(<NewSession options={OPTIONS} search={null} />)
    expect(screen.getByText(copy.similarNone)).toBeTruthy()
    expect(
      new FormData(
        screen.getByRole('form', {
          name: SESSIONS.form.label,
        }) as HTMLFormElement,
      ).get('parecido'),
    ).toBe('')
    expect(screen.getByText(copy.searchFold).closest('details')?.open).toBe(
      false,
    )
  })
})

const NOTE = '6f1c2a90-0000-4000-8000-000000000001'

const DRAFT: NewSessionDraft = {
  fields: {
    request:
      'a Iara, pelo gosto dela, leve, 3 filmes, até 2h, dos anos 90, nacional',
    attendees: ['iara'],
    rule: 'by',
    by: 'iara',
    moods: ['leve'],
    count: 3,
    maxDuration: 120,
    since: 1990,
    until: 1999,
    language: 'pt',
    child: 7,
    triggers: ['aranha'],
    similar: ['tt9001904'],
    unseen: true,
    noSlow: true,
    noSad: true,
  },
  reading: {
    understood: ['Presente: Iara', 'Clima: leve'],
    notUnderstood: ['pipoca', 'traz o vinho'],
    ambiguities: [
      {
        field: 'attendees',
        words: 'Teo',
        candidates: [
          { id: 'rosa', label: 'Rosa' },
          { id: 'teo', label: 'Teo' },
        ],
      },
      { field: 'similar', words: 'Amélie', candidates: [] },
    ],
  },
}

const showDraft = (draft: NewSessionDraft, similar?: string) => {
  render(
    <NewSession
      options={OPTIONS}
      draft={draft}
      note={NOTE}
      similar={similar}
    />,
  )
  return screen.getByRole('form', {
    name: SESSIONS.form.label,
  }) as HTMLFormElement
}

describe('reading a sentence (“Ler”)', () => {
  it('posts the form with “ler” from its button, and Enter still sends it', () => {
    const { form } = show()
    const read = screen.getByRole('button', {
      name: copy.read,
    }) as HTMLButtonElement
    expect([read.form, read.name, read.value]).toEqual([form, 'ler', 'sim'])
    // Enter presses the first submit button: not “ler”, but the one that
    // says Enter, so a search not run yet in its field searches instead.
    const first = form.querySelector<HTMLButtonElement>('button[type=submit]')
    expect([first?.name, first?.value]).toEqual(['tecla', 'enter'])
  })

  it('comes back with every field “Ler” left, and the sentence kept', () => {
    const form = showDraft(DRAFT)
    expect(posted(form)).toEqual({ ok: DRAFT.fields })
  })

  it('checks exactly the Presentes it left, the Dono too only if there', () => {
    const form = showDraft({
      ...DRAFT,
      fields: { attendees: ['quim'], rule: 'default' },
    })
    expect(posted(form)).toEqual({
      ok: { attendees: ['quim'], rule: 'default', moods: [] },
    })
  })

  it('keeps the form’s defaults for a field it did not leave', () => {
    const form = showDraft({ ...DRAFT, fields: { request: 'pipoca' } })
    expect(posted(form)).toEqual({
      ok: {
        attendees: ['bruno'],
        rule: 'default',
        moods: [],
        request: 'pipoca',
      },
    })
  })
})

describe('the form “Ler” filled', () => {
  it('adds the films “Usar” took since to the ones it left, and keeps its note', () => {
    const form = showDraft(
      { ...DRAFT, fields: { similar: ['tt9001904'] } },
      'tt9001904,tt9000101',
    )
    expect(posted(form)).toMatchObject({
      ok: { similar: ['tt9001904', 'tt9000101'] },
    })
    const search = new FormData(form)
    expect([search.get('parecido'), search.get('nota')]).toEqual([
      'tt9001904,tt9000101',
      NOTE,
    ])
  })

  it('says what it understood, what it did not and what it could not decide', () => {
    showDraft(DRAFT)
    const said = screen.getByRole('status').textContent
    const { reading } = DRAFT
    // As a sentence: "Presente: Iara" is Iara, "Clima: leve" is leve (#272).
    expect(said).toContain('Entendi: Iara, leve.')
    expect(said).toContain(copy.reading.notUnderstood(reading!.notUnderstood))
    expect(said).toContain(
      copy.reading.ambiguous([{ words: 'Teo', candidates: ['Rosa', 'Teo'] }]),
    )
    // A title the Catálogo lacks opens its search with the words (#272).
    expect(
      screen
        .getByRole('link', { name: copy.reading.missingSearch })
        .getAttribute('href'),
    ).toBe('/sessoes/nova?buscar=Am%C3%A9lie')
  })
})

describe('the form “Ler” filled, unclear titles and nothing understood', () => {
  it('lists the films of an unclear title, each with “Usar”', async () => {
    const form = showDraft({
      fields: { similar: ['tt9000101'] },
      reading: {
        understood: [],
        notUnderstood: [],
        ambiguities: [
          {
            field: 'similar',
            words: 'Reprise',
            candidates: [
              { id: 'tt9012601', label: 'Reprise (2011)' },
              { id: 'tt9012602', label: 'Reprise (2004)' },
            ],
          },
        ],
      },
    })
    expect(
      screen.getByText(copy.reading.similarAmbiguous('Reprise')),
    ).toBeTruthy()
    expect(screen.getByRole('status').textContent).not.toContain('Reprise')
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Usar Reprise (2004)' }))
    expect(new FormData(form).get('parecido')).toBe('tt9000101,tt9012602')
  })

  it('says when it understood nothing', () => {
    showDraft({
      fields: {},
      reading: { understood: [], notUnderstood: ['pipoca'], ambiguities: [] },
    })
    const said = screen.getByRole('status').textContent
    expect(said).toContain(copy.reading.nothing)
    expect(said).toContain(copy.reading.notUnderstood(['pipoca']))
  })
})

describe('“Mais opções”', () => {
  const details = () =>
    screen.getByText(copy.details).closest('details') as HTMLDetailsElement

  it('stays folded for a draft that set nothing under it', () => {
    showDraft({
      ...DRAFT,
      fields: {
        attendees: ['bruno', 'iara'],
        moods: ['leve'],
        rule: 'default',
      },
    })
    expect(details().open).toBe(false)
  })

  it('comes open for a draft that set a limit, the Regra or the Série', () => {
    showDraft(DRAFT)
    expect(details().open).toBe(true)
    cleanup()
    showDraft({ ...DRAFT, fields: { seriesOrder: 'all' } })
    expect(details().open).toBe(true)
  })

  it('comes open for a refusal about a field under it, and only then', () => {
    render(<NewSession options={OPTIONS} refusal="anos" />)
    expect(details().open).toBe(true)
    cleanup()
    // The duration sits above the fold (#272): its refusal leaves it shut.
    render(<NewSession options={OPTIONS} refusal="duracao" />)
    expect(details().open).toBe(false)
    cleanup()
    render(<NewSession options={OPTIONS} refusal="presentes" />)
    expect(details().open).toBe(false)
  })
})
