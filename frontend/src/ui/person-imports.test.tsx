// @vitest-environment jsdom
// A Pessoa's imports page and the list: what they show, and what each form
// posts (`parseImport`, the same reader the route uses).
import type { PersonImports } from '@filmes/engine'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import {
  IMPORT_NOTICES,
  IMPORT_REFUSALS,
  parseImport,
} from '#/content/import-action'
import { ImportsList } from './imports'
import { IMPORTS, PERSON_IMPORTS } from './imports.copy'
import { PersonImportsScreen } from './person-imports'

afterEach(cleanup)

const COPY = PERSON_IMPORTS
const NONE = { wikidata: 0, tmdb: 0, manual: 0 }
const TRAKT_FILE = 'imports/quim/trakt-b1.zip'

const QUIM: PersonImports = {
  person: 'quim',
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
  trakt: { ratings: 2, seen: 1 },
}

const show = (page: PersonImports = QUIM) =>
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
    expect(files.textContent).toContain('Export do Letterboxd · em 2026-11-20')
    expect(files.textContent).toContain('Export do Trakt · em 2026-11-21')
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
    ).toBe('/fila')
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

  it.each([
    ['letterboxd', COPY.upload.letterboxd],
    ['trakt', COPY.upload.trakt],
  ] as const)('uploads a %s ZIP as multipart', async (kind, summary) => {
    show()
    const user = userEvent.setup()
    const upload = section(COPY.upload.title)
    await user.click(within(upload).getByText(summary, { selector: 'summary' }))
    const form = within(upload).getByRole('form', { name: summary })
    expect(form.getAttribute('enctype')).toBe('multipart/form-data')
    // jsdom's File takes text: a Uint8Array of Node's realm would be empty.
    const file = new File(['PK'], 'export.zip', {
      type: 'application/zip',
    })
    await user.upload(within(form).getByLabelText(COPY.upload.file), file)
    expect(await posted(form)).toEqual({
      kind,
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
      'olga_farol',
    )
    expect(await posted(form)).toBe('consentimento')
    await user.click(within(form).getByLabelText(COPY.rss.consent('Quim')))
    expect(await posted(form)).toEqual({ kind: 'rss', user: 'olga_farol' })
  })

  it('says when she has nothing yet', () => {
    show({
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
      trakt: { ratings: 0, seen: 0 },
    })
    expect(section(COPY.files.title).textContent).toContain(COPY.files.empty)
    expect(section(COPY.letterboxd.title).textContent).toContain(
      'Nenhum filme importado.',
    )
    expect(section(COPY.trakt.title).textContent).toContain(
      '0 Notas e 0 Já vistos do Trakt.',
    )
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
      'Export do Letterboxd importado: nenhum Fato novo.',
    )
    expect(COPY.notices.trakt(1, 2)).toBe(
      'Export do Trakt importado: 1 Fato novo. 2 filmes ficaram de fora: o Catálogo não tem.',
    )
    expect(COPY.notices.trakt(3)).toBe(
      'Export do Trakt importado: 3 Fatos novos.',
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

describe('ImportsList', () => {
  it('leads to each Pessoa and to the queue', () => {
    render(
      <ImportsList
        overview={{
          people: [
            { person: 'bruno', name: 'Bruno', owner: true, imports: 0 },
            { person: 'quim', name: 'Quim', owner: false, imports: 2 },
          ],
          queued: 1,
        }}
      />,
    )
    expect(
      screen
        .getByRole('link', { name: /Fila de resolução.*1 filme esperando/ })
        .getAttribute('href'),
    ).toBe('/fila')
    expect(
      screen
        .getByRole('link', { name: /Bruno.*Dono.*nenhum import/ })
        .getAttribute('href'),
    ).toBe('/importar/bruno')
    expect(
      screen
        .getByRole('link', { name: /Quim.*2 imports/ })
        .getAttribute('href'),
    ).toBe('/importar/quim')
  })

  it('says when there is no one, a Pessoa is gone, or the engine cannot run', () => {
    render(<ImportsList overview={{ people: [], queued: 0 }} gone />)
    expect(screen.getByText(IMPORTS.empty)).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain(IMPORTS.gone)
    expect(screen.getByText(IMPORTS.queued(0))).toBeTruthy()
    cleanup()
    render(<ImportsList overview={null} />)
    expect(screen.getByRole('alert').textContent).toContain(IMPORTS.unavailable)
  })
})
