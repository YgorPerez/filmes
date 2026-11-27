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

describe('PersonImportsScreen', () => {
  it('lists her imports and what they gave', () => {
    show()
    const files = section(COPY.files.title)
    expect(files.textContent).toContain('letterboxd-quim.zip')
    expect(files.textContent).toContain('Arquivo do Letterboxd · em 2026-11-20')
    expect(files.textContent).toContain('Arquivo do Trakt · em 2026-11-21')
    const letterboxd = section(COPY.letterboxd.title)
    expect(letterboxd.textContent).toContain('10 filmes')
    expect(letterboxd.textContent).toContain('5 pelo Wikidata · 1 pelo TMDB')
    expect(letterboxd.textContent).toContain(
      '1 filme espera na fila de resolução',
    )
    expect(letterboxd.textContent).toContain('Vento Norte (2020)')
    expect(
      within(letterboxd)
        .getByRole('link', { name: COPY.letterboxd.toQueue })
        .getAttribute('href'),
    ).toBe('/meu-gosto/fila')
    expect(section(COPY.trakt.title).textContent).toContain(
      '2 Notas e 1 Já visto do Trakt.',
    )
  })

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

  it('opens with the upload: one file field, the only orange button', async () => {
    const { container } = show()
    const user = userEvent.setup()
    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent)
    expect(headings.slice(0, 2)).toEqual([COPY.upload.title, COPY.rss.title])
    expect(headings.at(-1)).toBe(COPY.files.title)
    const form = within(section(COPY.upload.title)).getByRole('form', {
      name: COPY.upload.title,
    })
    expect(form.getAttribute('enctype')).toBe('multipart/form-data')
    expect(
      within(form)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['Letterboxd', 'https://letterboxd.com/settings/data/'],
      ['Trakt', 'https://trakt.tv/settings/data'],
      ['IMDb', 'https://www.imdb.com/list/ratings'],
      [
        'Simkl',
        'https://docs.simkl.org/how-to-use-simkl/advanced-usage/import-export-data/exporting-from-simkl/export-data-formats',
      ],
    ])
    expect(
      within(form).getByLabelText(COPY.upload.file).getAttribute('accept'),
    ).toBe('.zip,application/zip,.csv,text/csv,.json,application/json')
    // The One Orange Button Rule.
    expect(
      [...container.querySelectorAll('.bg-sticker-orange')].map(
        (b) => b.textContent,
      ),
    ).toEqual([COPY.upload.submit])
    // jsdom's File takes text: a Uint8Array of Node's realm would be empty.
    const file = new File(['PK'], 'export.zip', {
      type: 'application/zip',
    })
    await user.upload(within(form).getByLabelText(COPY.upload.file), file)
    expect(await posted(form)).toEqual({
      kind: 'upload',
      original: 'export.zip',
      content: new Uint8Array([80, 75]),
    })
  })

  it('links her RSS only with her consent', async () => {
    show()
    const user = userEvent.setup()
    const form = within(section(COPY.rss.title)).getByRole('form', {
      name: COPY.rss.title,
    })
    await user.type(
      within(form).getByLabelText(COPY.rss.user, { exact: false }),
      'https://letterboxd.com/olga_farol/',
    )
    expect(await posted(form)).toBe('consentimento')
    await user.click(within(form).getByLabelText(COPY.rss.consent('Quim')))
    expect(await posted(form)).toEqual({ kind: 'rss', user: 'olga_farol' })
  })

  it('asks no consent on the Dono’s own page', () => {
    show({ ...QUIM, own: true })
    const rss = section(COPY.rss.title)
    expect(within(rss).queryByRole('checkbox')).toBeNull()
    expect(rss.textContent).not.toContain(COPY.rss.consent('Quim'))
  })

  it('hides the summaries while they are empty', () => {
    show(EMPTY)
    expect(section(COPY.files.title).textContent).toContain(COPY.files.empty)
    expect(
      screen.queryByRole('region', { name: COPY.letterboxd.title }),
    ).toBeNull()
    expect(screen.queryByRole('region', { name: COPY.trakt.title })).toBeNull()
    cleanup()
    show({ ...EMPTY, trakt: QUIM.trakt })
    expect(
      screen.queryByRole('region', { name: COPY.letterboxd.title }),
    ).toBeNull()
    expect(section(COPY.trakt.title).textContent).toContain(
      '2 Notas e 1 Já visto do Trakt.',
    )
    expect(screen.queryByRole('region', { name: COPY.imdb.title })).toBeNull()
    cleanup()
    show({ ...EMPTY, imdb: { ratings: 1 } })
    expect(screen.queryByRole('region', { name: COPY.trakt.title })).toBeNull()
    expect(section(COPY.imdb.title).textContent).toContain('1 Nota do IMDb.')
    expect(screen.queryByRole('region', { name: COPY.simkl.title })).toBeNull()
    cleanup()
    show({ ...EMPTY, simkl: { ratings: 2, seen: 1, watchlist: 4 } })
    expect(screen.queryByRole('region', { name: COPY.imdb.title })).toBeNull()
    expect(section(COPY.simkl.title).textContent).toContain(
      '2 Notas e 1 Já visto do Simkl.',
    )
  })

  it('says how to download each file when one is of no service', () => {
    render(<PersonImportsScreen slug="quim" page={QUIM} refusal="origem" />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain(
      'Esse arquivo não parece ser do Letterboxd, do Trakt, do IMDb nem do Simkl.',
    )
    expect(
      within(alert)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual([
      'https://letterboxd.com/settings/data/',
      'https://trakt.tv/settings/data',
      'https://www.imdb.com/list/ratings',
      'https://docs.simkl.org/how-to-use-simkl/advanced-usage/import-export-data/exporting-from-simkl/export-data-formats',
    ])
  })

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

  it('shows no Trakt section on a server that does not read it', () => {
    show({ ...QUIM, traktLink: { available: false, connected: false } })
    expect(screen.queryByRole('region', { name: TRAKT_SYNC.title })).toBeNull()
  })

  it('says when no Pessoa has the name, or the engine cannot run', () => {
    render(<PersonImportsScreen slug="ninguem" page="unknown" />)
    expect(screen.getByRole('alert').textContent).toContain(COPY.unknown)
    cleanup()
    render(<PersonImportsScreen slug="quim" page={null} />)
    expect(screen.getByRole('alert').textContent).toContain(COPY.unavailable)
  })

  it.each(IMPORT_NOTICES)('says what happened: %s', (notice) => {
    render(
      <PersonImportsScreen
        slug="quim"
        page={QUIM}
        done={{ notice, facts: 3, outside: 2 }}
      />,
    )
    expect(screen.getByRole('status').textContent).toBe(
      COPY.notices[notice](3, 2),
    )
  })

  it('counts in the notices', () => {
    expect(COPY.notices.letterboxd(0)).toBe(
      'Arquivo do Letterboxd importado: nenhum Fato novo.',
    )
    expect(COPY.notices.trakt(1, 2)).toBe(
      'Arquivo do Trakt importado: 1 Fato novo. 2 filmes ficaram de fora: o Catálogo não tem.',
    )
    expect(COPY.notices.trakt(3)).toBe(
      'Arquivo do Trakt importado: 3 Fatos novos.',
    )
    expect(COPY.notices.imdb(1, 1)).toBe(
      'CSV do IMDb importado: 1 Fato novo. 1 título ficou de fora: o Catálogo não tem.',
    )
    expect(COPY.notices.removido(0)).toContain('Nenhum Fato saiu')
    expect(COPY.notices.removido(1)).toBe('Import tirado: 1 Fato saiu.')
  })

  it.each(IMPORT_REFUSALS)('says why not: %s', (refusal) => {
    render(<PersonImportsScreen slug="quim" page={QUIM} refusal={refusal} />)
    expect(screen.getByRole('alert').textContent).toContain(
      COPY.refusals[refusal],
    )
  })
})
