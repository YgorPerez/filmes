// @vitest-environment jsdom
// A Pessoa's imports page: what it shows, and what each form
// posts (`parseImport`, the same reader the route uses).
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import {
  IMPORT_NOTICES,
  IMPORT_REFUSALS,
  parseImport,
} from '#/content/import-action'
import { PERSON_IMPORTS } from './imports.copy'
import { TRAKT_SYNC } from './trakt-sync.copy'
import { PersonImportsScreen, type PersonImportsView } from './person-imports'

afterEach(cleanup)

const COPY = PERSON_IMPORTS
const NONE = { wikidata: 0, tmdb: 0, manual: 0 }
const TRAKT_FILE = 'imports/quim/trakt-b1.zip'

const QUIM: PersonImportsView = {
  person: 'quim',
  own: false,
  name: 'Quim',
  imports: [
    {
      kind: 'letterboxd',
      file: 'imports/quim/letterboxd-a1.zip',
      date: '2026-11-20',
      original: 'letterboxd-quim.zip',
    },
    {
      kind: 'trakt',
      file: TRAKT_FILE,
      date: '2026-11-21',
      original: 'trakt.zip',
    },
  ],
  letterboxd: {
    person: 'quim',
    films: 10,
    resolved: { wikidata: 5, tmdb: 1, manual: 0 },
    discarded: { wikidata: 1, tmdb: 0, manual: 0 },
    queued: 1,
    queue: [
      {
        id: 'vento-norte-2020-e2bf439e1af6',
        name: 'Vento Norte',
        year: 2020,
        reason: 'o TMDB achou mais de um filme com esse título',
      },
    ],
    discardedItems: [],
  },
  trakt: { ratings: 2, seen: 1, watchlist: 0 },
  imdb: { ratings: 0 },
  simkl: { ratings: 0, seen: 0, watchlist: 0 },
  tvtime: { ratings: 0, seen: 0, stated: 0, watchlist: 0 },
}

/** Quim with nothing imported yet. */
const EMPTY: PersonImportsView = {
  ...QUIM,
  imports: [],
  letterboxd: {
    ...QUIM.letterboxd,
    films: 0,
    resolved: NONE,
    discarded: NONE,
    queued: 0,
    queue: [],
  },
  trakt: { ratings: 0, seen: 0, watchlist: 0 },
  imdb: { ratings: 0 },
  simkl: { ratings: 0, seen: 0, watchlist: 0 },
  tvtime: { ratings: 0, seen: 0, stated: 0, watchlist: 0 },
}

const show = (page: PersonImportsView = QUIM) =>
  render(<PersonImportsScreen slug={page.person} page={page} />)

const section = (name: string) => screen.getByRole('region', { name })

/** jsdom's File may lack `arrayBuffer` (a browser's and Node's have it):
 * give it one through jsdom's FileReader. */
const readable = (file: File): File => {
  if (typeof file.arrayBuffer === 'function') return file
  return Object.assign(file, {
    arrayBuffer: () =>
      new Promise<ArrayBuffer>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as ArrayBuffer)
        reader.readAsArrayBuffer(file)
      }),
  })
}

const posted = async (form: HTMLElement) => {
  expect(form).toBeInstanceOf(HTMLFormElement)
  const element = form as HTMLFormElement
  expect(element.method).toBe('post')
  expect(new URL(element.action).pathname).toBe('/importar/quim/acao')
  const data = new FormData(element)
  // jsdom's FormData reads its own file list, not the one user-event sets:
  // put the chosen files in by the input's name, as a browser sends them.
  for (const input of element.querySelectorAll<HTMLInputElement>(
    'input[type=file]',
  ))
    for (const file of input.files ?? []) data.set(input.name, readable(file))
  return parseImport(data)
}

const LETTERBOXD = COPY.letterboxd.title
const OTHER = COPY.other.title

/** The guided Letterboxd upload, the other sites' and the profile's form. */
const form = (name: string) => screen.getByRole('form', { name })

describe('PersonImportsScreen', () => {
  it('puts what came in first, then the files, and folds the forms', () => {
    show()
    const results = section(COPY.results.title)
    expect(results.textContent).toContain('Letterboxd: 10 filmes')
    // Found, left out and waiting: plain counts, no path jargon.
    expect(
      within(results)
        .getAllByRole('definition')
        .map((d) => d.textContent),
    ).toEqual(['6', '1', '1'])
    expect(results.textContent).not.toContain('Wikidata')
    expect(results.textContent).toContain(COPY.results.queued(1))
    expect(results.textContent).toContain('Vento Norte (2020)')
    expect(
      within(results)
        .getByRole('link', { name: COPY.results.toQueue })
        .getAttribute('href'),
    ).toBe('/meu-gosto/fila')
    expect(results.textContent).toContain('Trakt: 2 Notas e 1 Já visto')
    const files = section(COPY.files.title)
    expect(files.textContent).toContain('ZIP do Letterboxd · em 20 nov 2026')
    expect(files.textContent).toContain('ZIP do Trakt · em 21 nov 2026')
    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent)
    expect(headings.slice(0, 2)).toEqual([COPY.results.title, COPY.files.title])
    // The forms wait under "Importar de novo", closed.
    const again = screen.getByText(COPY.results.again).closest('details')
    expect(again?.open).toBe(false)
    expect(
      within(again as HTMLElement).getByRole('form', {
        name: COPY.letterboxd.send.title,
      }),
    ).toBeTruthy()
  })

  it('lists the films left out, and why', async () => {
    show({
      ...QUIM,
      letterboxd: {
        ...QUIM.letterboxd,
        discardedItems: [
          {
            id: 'x',
            name: 'Filme Perdido',
            year: 2001,
            reason: 'nem o Wikidata nem o TMDB acharam o filme',
            resolvedBy: null,
          },
        ],
      },
    })
    const user = userEvent.setup()
    await user.click(screen.getByText(COPY.results.seeOutside(1)))
    expect(section(COPY.results.title).textContent).toContain(
      'Filme Perdido (2001) · nem o Wikidata nem o TMDB acharam o filme',
    )
  })
})

describe('PersonImportsScreen', () => {
  it('removes an import after a second click', async () => {
    show()
    const user = userEvent.setup()
    const files = section(COPY.files.title)
    await user.click(
      within(files).getByLabelText(COPY.files.removeLabel('trakt.zip')),
    )
    const button = within(files).getAllByRole('button', {
      name: COPY.files.removeConfirm,
    })[1]
    expect(await posted(button?.closest('form') as HTMLElement)).toEqual({
      kind: 'remove',
      file: TRAKT_FILE,
    })
  })
})

describe('PersonImportsScreen', () => {
  it('walks a first import through Letterboxd: page, export, ZIP, profile', async () => {
    const { container } = show(EMPTY)
    const user = userEvent.setup()
    expect(
      screen.queryByRole('region', { name: COPY.results.title }),
    ).toBeNull()
    expect(screen.queryByRole('region', { name: COPY.files.title })).toBeNull()
    const guide = section(LETTERBOXD)
    expect(
      within(guide)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual([
      COPY.letterboxd.open.title,
      COPY.letterboxd.export.title,
      COPY.letterboxd.send.title,
      COPY.letterboxd.profile.title,
    ])
    expect(
      within(guide)
        .getByRole('link', { name: COPY.letterboxd.open.link })
        .getAttribute('href'),
    ).toBe('https://letterboxd.com/settings/data/')
    const upload = form(COPY.letterboxd.send.title)
    expect(upload.getAttribute('enctype')).toBe('multipart/form-data')
    expect(new URL((upload as HTMLFormElement).action).search).toBe(
      '?de=letterboxd',
    )
    // The One Orange Button Rule.
    expect(
      [...container.querySelectorAll('.bg-sticker-orange')].map(
        (b) => b.textContent,
      ),
    ).toEqual([COPY.letterboxd.send.submit])
    const input = within(upload).getByLabelText(COPY.letterboxd.send.file)
    expect(input.getAttribute('accept')).toBe('.zip,application/zip')
    // jsdom's File takes text: a Uint8Array of Node's realm would be empty.
    const file = new File(['PK'], 'export.zip', { type: 'application/zip' })
    await user.upload(input, file)
    // The zone names the file picked.
    expect(upload.textContent).toContain('export.zip')
    expect(await posted(upload)).toEqual({
      kind: 'upload',
      original: 'export.zip',
      content: new Uint8Array([80, 75]),
    })
  })
})

describe('PersonImportsScreen', () => {
  it('catches a file of the wrong kind before the upload', async () => {
    show(EMPTY)
    const user = userEvent.setup({ applyAccept: false })
    const upload = form(COPY.letterboxd.send.title)
    const input = within(upload).getByLabelText(COPY.letterboxd.send.file)
    await user.upload(input, new File(['a,b'], 'ratings.csv'))
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(within(upload).getByRole('alert').textContent).toBe(
      COPY.letterboxd.send.wrongType,
    )
    expect((input as HTMLInputElement).validity.valid).toBe(false)
  })

  it('sends the other sites’ files through their own upload', async () => {
    show(EMPTY)
    const other = section(OTHER)
    expect(
      within(other)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual([
      'https://trakt.tv/settings/data',
      'https://www.imdb.com/list/ratings',
      'https://docs.simkl.org/how-to-use-simkl/advanced-usage/import-export-data/exporting-from-simkl/export-data-formats',
    ])
    const upload = form(OTHER)
    expect(new URL((upload as HTMLFormElement).action).search).toBe('?de=outro')
    expect(
      within(upload).getByLabelText(COPY.other.file).getAttribute('accept'),
    ).toBe('.zip,application/zip,.csv,text/csv,.json,application/json')
    // TV Time is closed: its steps name the backup, with no link.
    const tvtime = within(other)
      .getByText(COPY.other.how('TV Time'))
      .closest('details') as HTMLElement
    expect(tvtime.textContent).toContain(
      'O gdpr-data.zip que o TV Time mandou, ou o tv-time-export.zip do TV Time Liberator.',
    )
    expect(within(tvtime).queryByRole('link')).toBeNull()
  })

  it('links her RSS only with her consent', async () => {
    show(EMPTY)
    const user = userEvent.setup()
    const rss = form(COPY.rss.title)
    await user.type(
      within(rss).getByLabelText(COPY.rss.user, { exact: false }),
      'https://letterboxd.com/olga_farol/',
    )
    expect(await posted(rss)).toBe('consentimento')
    await user.click(within(rss).getByLabelText(COPY.rss.consent('Quim')))
    expect(await posted(rss)).toEqual({ kind: 'rss', user: 'olga_farol' })
  })
})

describe('PersonImportsScreen', () => {
  it('reads the last profile again with one tap', async () => {
    show({
      ...QUIM,
      own: true,
      imports: [
        ...QUIM.imports,
        {
          kind: 'letterboxd-rss',
          file: 'imports/quim/letterboxd-rss-c1.xml',
          date: '2026-11-22',
          original: 'https://letterboxd.com/olga_farol/rss/',
        },
      ],
    })
    expect(section(COPY.files.title).textContent).toContain('@olga_farol')
    const update = form(COPY.rss.update('@olga_farol')) as HTMLFormElement
    // Her own page: no consent box, so the profile's name is all it sends.
    expect(await parseImport(new FormData(update), true)).toEqual({
      kind: 'rss',
      user: 'olga_farol',
    })
  })

  it('asks no consent on the Dono’s own page', () => {
    show({ ...EMPTY, own: true })
    const rss = form(COPY.rss.title)
    expect(within(rss).queryByRole('checkbox')).toBeNull()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Importar Notas',
    )
  })
})

describe('PersonImportsScreen', () => {
  it('shows a refusal under the form that was sent, its field marked', () => {
    render(
      <PersonImportsScreen
        slug="quim"
        page={EMPTY}
        refusal="usuario"
        refusedIn="perfil"
      />,
    )
    const rss = form(COPY.rss.title)
    const field = within(rss).getByLabelText(COPY.rss.user, { exact: false })
    expect(field.getAttribute('aria-invalid')).toBe('true')
    const why = document.getElementById(
      field.getAttribute('aria-describedby') ?? '',
    )
    expect(why?.textContent).toBe(COPY.refusals.usuario)
    cleanup()
    render(
      <PersonImportsScreen
        slug="quim"
        page={QUIM}
        refusal="origem"
        refusedIn="outro"
      />,
    )
    // Folded under "Importar de novo", the refused form opens.
    const other = form(OTHER)
    expect(other.closest('details')?.open).toBe(true)
    expect(within(other).getByRole('alert').textContent).toBe(
      COPY.refusals.origem,
    )
    expect(
      within(form(COPY.letterboxd.send.title)).queryByRole('alert'),
    ).toBeNull()
  })
})

describe('PersonImportsScreen', () => {
  it('reads her Trakt: one tap once linked, a public profile with her yes', async () => {
    show({
      ...QUIM,
      traktLink: { available: true, connected: false },
      imports: [
        ...QUIM.imports,
        {
          kind: 'trakt-api',
          file: 'imports/quim/trakt-api-c1.json',
          date: '2026-11-22',
          original: '@quim_t',
        },
      ],
    })
    const user = userEvent.setup()
    const trakt = section(TRAKT_SYNC.title)
    const sync = within(trakt).getByRole('form', { name: TRAKT_SYNC.sync })
    expect(within(sync).getByRole('button').textContent).toBe(
      TRAKT_SYNC.syncUser('@quim_t'),
    )
    expect(await posted(sync)).toEqual({ kind: 'trakt-sync', user: null })
    await user.click(within(trakt).getByText(TRAKT_SYNC.otherUser))
    const read = within(trakt).getByRole('form', { name: TRAKT_SYNC.read })
    await user.type(
      within(read).getByLabelText(TRAKT_SYNC.user, { exact: false }),
      'https://trakt.tv/users/quim_t',
    )
    expect(await posted(read)).toBe('consentimento')
    await user.click(within(read).getByLabelText(TRAKT_SYNC.consent('Quim')))
    expect(await posted(read)).toEqual({ kind: 'trakt-sync', user: 'quim_t' })
  })

  it('says a Trakt refusal in the Trakt section that sent it', () => {
    render(
      <PersonImportsScreen
        slug="quim"
        page={{ ...QUIM, traktLink: { available: true, connected: false } }}
        refusal="trakt-privado"
        refusedIn="trakt"
      />,
    )
    expect(
      within(section(TRAKT_SYNC.title)).getByRole('alert').textContent,
    ).toBe(COPY.refusals['trakt-privado'])
  })

  it('shows no Trakt section on a server that does not read it', () => {
    show({ ...QUIM, traktLink: { available: false, connected: false } })
    expect(screen.queryByRole('region', { name: TRAKT_SYNC.title })).toBeNull()
  })

  it('counts the TV Time backup, whose films share the Letterboxd resolution', () => {
    const tvtime = { ratings: 3, seen: 4, stated: 0, watchlist: 1 }
    const record = {
      kind: 'tvtime',
      file: 'imports/quim/tvtime-d1.zip',
      date: '2026-11-23',
      original: 'gdpr-data.zip',
    }
    show({ ...QUIM, imports: [...QUIM.imports, record], tvtime })
    const results = section(COPY.results.title)
    expect(results.textContent).toContain('Letterboxd e TV Time: 10 filmes')
    expect(results.textContent).toContain(
      '1 filme do Letterboxd e do TV Time espera você confirmar qual é',
    )
    expect(results.textContent).toContain('TV Time: 3 Notas e 4 Já vistos')
    expect(section(COPY.files.title).textContent).toContain(
      'Backup do TV Time · em 23 nov 2026',
    )
    cleanup()
    show({
      ...EMPTY,
      imports: [record],
      letterboxd: { ...QUIM.letterboxd, films: 4 },
      tvtime,
    })
    const alone = section(COPY.results.title)
    expect(alone.textContent).toContain('TV Time: 4 filmes')
    expect(alone.textContent).toContain(COPY.results.queued(1, 'tvtime'))
    expect(alone.textContent).not.toContain('Letterboxd')
  })

  it('says when no Pessoa has the name, or the engine cannot run', () => {
    render(<PersonImportsScreen slug="ninguem" page="unknown" />)
    expect(screen.getByRole('alert').textContent).toContain(COPY.unknown)
    cleanup()
    render(<PersonImportsScreen slug="quim" page={null} />)
    expect(screen.getByRole('alert').textContent).toContain(COPY.unavailable)
  })
})

describe('PersonImportsScreen', () => {
  it.each(IMPORT_NOTICES)('says what happened: %s', (notice) => {
    const done = { notice, facts: 3, ratings: 2, seen: 1, outside: 2 }
    render(<PersonImportsScreen slug="quim" page={QUIM} done={done} />)
    expect(screen.getByRole('status').textContent).toBe(
      COPY.notices[notice](done),
    )
  })

  it('counts Notas and Já vistos in the notices', () => {
    const none = { facts: 0, ratings: 0, seen: 0 }
    expect(COPY.notices.letterboxd(none)).toBe(
      'O ZIP do Letterboxd entrou: nada novo, esses filmes já estavam aqui.',
    )
    expect(
      COPY.notices.trakt({ facts: 2, ratings: 1, seen: 1, outside: 2 }),
    ).toBe(
      'O ZIP do Trakt entrou: entraram 1 Nota nova e 1 Já visto novo. 2 filmes ficaram de fora: o Catálogo do filmes não tem.',
    )
    expect(COPY.notices.rss({ facts: 5, ratings: 0, seen: 3 })).toBe(
      'Perfil do Letterboxd lido: entraram 3 Já vistos novos.',
    )
    expect(
      COPY.notices.tvtime({ facts: 6, ratings: 2, seen: 3, outside: 1 }),
    ).toBe(
      'O backup do TV Time entrou: entraram 2 Notas novas e 3 Já vistos novos. 1 filme ficou de fora: o Catálogo do filmes não tem.',
    )
    expect(COPY.notices.removido(none)).toContain('Nada saiu')
  })

  it('says which Notas an import replaced, apart from the new ones (#274)', () => {
    expect(
      COPY.notices.trakt({
        facts: 3,
        ratings: 1,
        seen: 0,
        changed: 1,
        changes: [{ title: 'Maré Baixa (2015)', from: 9, to: 1 }],
        repeated: 1,
      }),
    ).toBe(
      'O ZIP do Trakt entrou: entraram 1 Nota nova. 1 Nota mudou: Maré Baixa (2015), de 9 para 1. 1 filme ficou com a Nota que já tinha.',
    )
    expect(
      COPY.notices.letterboxd({
        facts: 9,
        ratings: 4,
        seen: 1,
        watchlist: 1,
        changed: 5,
        changes: [
          { title: 'A', from: 9, to: 1 },
          { title: 'B', from: 2, to: 8 },
        ],
        repeated: 3,
      }),
    ).toBe(
      'O ZIP do Letterboxd entrou: entraram 4 Notas novas, 1 Já visto novo e 1 filme na watchlist. 5 Notas mudaram: A, de 9 para 1; B, de 2 para 8 e mais 3 outras. 3 filmes ficaram com a Nota que já tinham.',
    )
    // Only films that kept their Notas: nothing new.
    expect(
      COPY.notices.letterboxd({ facts: 4, ratings: 0, seen: 0, repeated: 4 }),
    ).toBe(
      'O ZIP do Letterboxd entrou: nada novo, esses filmes já estavam aqui.',
    )
    const done = {
      notice: 'trakt' as const,
      facts: 3,
      ratings: 0,
      seen: 0,
      changed: 1,
      changes: [{ title: 'Maré Baixa (2015)', from: 9, to: 1 }],
    }
    render(<PersonImportsScreen slug="quim" page={QUIM} done={done} />)
    expect(
      within(screen.getByRole('status'))
        .getByRole('link', { name: COPY.changedLink })
        .getAttribute('href'),
    ).toBe('/pessoas/quim#notas')
  })

  it.each(IMPORT_REFUSALS)('says why not: %s', (refusal) => {
    render(<PersonImportsScreen slug="quim" page={EMPTY} refusal={refusal} />)
    expect(
      screen
        .getAllByRole('alert')
        .some((alert) => alert.textContent?.includes(COPY.refusals[refusal])),
    ).toBe(true)
  })
})

describe('the Trakt section on her own page', () => {
  it('syncs her connected account in one tap, with no profile to type', async () => {
    show({
      ...QUIM,
      own: true,
      traktLink: { available: true, connected: true },
    })
    const trakt = section(TRAKT_SYNC.title)
    expect(trakt.textContent).toContain(TRAKT_SYNC.connected)
    const sync = within(trakt).getByRole('form', { name: TRAKT_SYNC.sync })
    expect(within(sync).getByRole('button').textContent).toBe(TRAKT_SYNC.sync)
    expect(await posted(sync)).toEqual({ kind: 'trakt-sync', user: null })
    expect(within(trakt).getByRole('link').textContent).toBe(TRAKT_SYNC.manage)
    expect(
      within(trakt).queryByRole('form', { name: TRAKT_SYNC.read }),
    ).toBeNull()
  })

  it('asks her to connect, or to read her public profile, without a yes', () => {
    show({
      ...QUIM,
      own: true,
      traktLink: { available: true, connected: false },
    })
    const trakt = section(TRAKT_SYNC.title)
    expect(trakt.textContent).toContain(TRAKT_SYNC.connect)
    expect(within(trakt).getByRole('link').textContent).toBe(
      TRAKT_SYNC.connectLink,
    )
    expect(
      within(trakt).queryByRole('form', { name: TRAKT_SYNC.sync }),
    ).toBeNull()
    const read = within(trakt).getByRole('form', { name: TRAKT_SYNC.read })
    expect(read.textContent).toContain(TRAKT_SYNC.ownUser)
    expect(within(read).queryByRole('checkbox')).toBeNull()
  })

  it('points another Pessoa to the Trakt page, her yes asked', () => {
    show({ ...QUIM, traktLink: { available: true, connected: true } })
    const trakt = section(TRAKT_SYNC.title)
    expect(trakt.textContent).toContain(TRAKT_SYNC.other('Quim'))
    expect(within(trakt).getByRole('link').textContent).toBe(
      TRAKT_SYNC.otherLink,
    )
    const read = within(trakt).getByRole('form', { name: TRAKT_SYNC.read })
    expect(within(read).getByRole('checkbox')).toBeTruthy()
  })
})

describe('what came in, site by site', () => {
  it('lists the other sites without Letterboxd, and a profile by its address', () => {
    show({
      ...EMPTY,
      imports: [
        {
          kind: 'letterboxd-rss',
          file: 'imports/quim/rss-a1.xml',
          date: '2026-11-22',
          original: 'perfil antigo',
        },
      ],
      imdb: { ratings: 3 },
      simkl: { ratings: 0, seen: 2, watchlist: 0 },
    })
    const results = section(COPY.results.title)
    expect(
      within(results)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([COPY.results.imdb(3), COPY.results.simkl(0, 2)])
    expect(within(results).queryByRole('definition')).toBeNull()
    expect(section(COPY.files.title).textContent).toContain('perfil antigo')
  })

  it('shows nothing in for files that gave nothing', () => {
    show({
      ...EMPTY,
      imports: [
        {
          kind: 'trakt',
          file: TRAKT_FILE,
          date: '2026-11-21',
          original: 'trakt.zip',
        },
      ],
    })
    expect(
      screen.queryByRole('region', { name: COPY.results.title }),
    ).toBeNull()
  })
})

describe('what came in, site by site', () => {
  it('names the films without a year by their name alone, with why left out', async () => {
    show({
      ...QUIM,
      letterboxd: {
        ...QUIM.letterboxd,
        queue: [{ id: 'sem-ano', name: 'Sem Ano', year: null, reason: '' }],
        discardedItems: [
          {
            id: 'fora',
            name: 'Fora',
            year: null,
            reason: 'curta',
            resolvedBy: null,
          },
          {
            id: 'outro',
            name: 'Outro',
            year: 1999,
            reason: '',
            resolvedBy: null,
          },
        ],
      },
    })
    const results = section(COPY.results.title)
    expect(results.textContent).toContain('Sem Ano')
    expect(results.textContent).not.toContain('Sem Ano (')
    await userEvent
      .setup()
      .click(within(results).getByText(COPY.results.seeOutside(2)))
    const outside = within(results)
      .getAllByRole('listitem')
      .map((item) => item.textContent)
    expect(outside).toContain('Fora · curta')
    expect(outside).toContain('Outro (1999)')
  })
})
