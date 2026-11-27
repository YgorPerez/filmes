// A Pessoa's imports page: the upload, the Letterboxd profile, what the
// imports gave and the files, with what the last form did.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { PERSON_IMPORTS } from './imports.copy'
import { PersonImportsScreen, type PersonImportsView } from './person-imports'

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
  args: { done: { notice: 'trakt', facts: 3, outside: 2 } },
}

export const Refused: Story = { args: { refusal: 'origem' } }

export const Unknown: Story = { args: { slug: 'ninguem', page: 'unknown' } }

export const Unavailable: Story = { args: { page: null } }
