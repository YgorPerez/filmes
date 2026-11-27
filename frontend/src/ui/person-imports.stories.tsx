// A Pessoa's imports page: the upload, the Letterboxd profile, what the
// imports gave and the files, with what the last form did.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { PERSON_IMPORTS } from './imports.copy'
import { PersonImportsScreen, type PersonImportsView } from './person-imports'

const NONE = { wikidata: 0, tmdb: 0, manual: 0 }
const TRAKT_FILE = 'imports/quim/trakt-b1.zip'
const IMDB_FILE = 'imports/quim/imdb-c1.csv'
const SIMKL_FILE = 'imports/quim/simkl-d1.zip'

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
    {
      kind: 'imdb',
      file: IMDB_FILE,
      date: '2026-11-22',
      original: 'ratings.csv',
    },
    {
      kind: 'simkl',
      file: SIMKL_FILE,
      date: '2026-11-23',
      original: 'SimklBackup.zip',
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
  imdb: { ratings: 412 },
  simkl: { ratings: 87, seen: 140, watchlist: 12 },
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

/** Quim with only the IMDb CSV. */
const IMDB_ONLY: PersonImportsView = {
  ...EMPTY,
  imports: QUIM.imports.filter(({ kind }) => kind === 'imdb'),
  imdb: { ratings: 412 },
}

/** Quim with only the Simkl backup. */
const SIMKL_ONLY: PersonImportsView = {
  ...EMPTY,
  imports: QUIM.imports.filter(({ kind }) => kind === 'simkl'),
  simkl: QUIM.simkl,
}

const meta = {
  component: PersonImportsScreen,
  args: { slug: 'quim', page: QUIM },
} satisfies Meta<typeof PersonImportsScreen>

export default meta

type Story = StoryObj<typeof meta>

export const WithImports: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('heading', {
        level: 1,
        name: PERSON_IMPORTS.title('Quim', false),
      }),
    ).toBeVisible()
  },
}

export const Own: Story = {
  args: { slug: 'quim', page: { ...QUIM, own: true } },
}

export const NothingYet: Story = { args: { page: EMPTY } }

export const Imported: Story = {
  args: {
    done: { notice: 'trakt', facts: 3, ratings: 2, seen: 1, outside: 2 },
  },
}

export const OnlyImdb: Story = {
  args: { page: IMDB_ONLY },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(PERSON_IMPORTS.results.imdb(412)),
    ).toBeVisible()
  },
}

export const ImdbImported: Story = {
  args: {
    page: IMDB_ONLY,
    done: { notice: 'imdb', facts: 412, ratings: 412, seen: 0, outside: 3 },
  },
}

export const OnlySimkl: Story = {
  args: { page: SIMKL_ONLY },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(PERSON_IMPORTS.results.simkl(87, 140)),
    ).toBeVisible()
  },
}

export const SimklImported: Story = {
  args: {
    page: SIMKL_ONLY,
    done: { notice: 'simkl', facts: 239, ratings: 87, seen: 140, outside: 4 },
  },
}

export const Refused: Story = {
  args: { page: EMPTY, refusal: 'origem', refusedIn: 'letterboxd' },
}

/** The profile's name refused: the field is marked, the why under it. */
export const ProfileRefused: Story = {
  args: { page: EMPTY, refusal: 'usuario', refusedIn: 'perfil' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('textbox', {
        name: new RegExp(PERSON_IMPORTS.rss.user),
      }),
    ).toHaveAttribute('aria-invalid', 'true')
  },
}

export const Unknown: Story = { args: { slug: 'ninguem', page: 'unknown' } }

export const Unavailable: Story = { args: { page: null } }
