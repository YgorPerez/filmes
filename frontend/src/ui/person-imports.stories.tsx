// A Pessoa's imports page: the upload, the Letterboxd profile, what the
// imports gave and the files, with what the last form did.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { PERSON_IMPORTS } from './imports.copy'
import { PersonImportsScreen, type PersonImportsView } from './person-imports'

const NONE = { wikidata: 0, tmdb: 0, manual: 0 }
/** A site's films (#274), counted as its notice counts them. */
const NO_FILMS = { rated: 0, seen: 0, watchlist: 0 }
const FILMS = {
  trakt: NO_FILMS,
  imdb: NO_FILMS,
  simkl: NO_FILMS,
  tvtime: NO_FILMS,
}
/** No site left a film out (#348). */
const NO_LEFT_OUT = { trakt: [], imdb: [], simkl: [], tvtime: [] }
/** What the IMDb CSV left out: an episode the Catálogo has not (#348). */
const IMDB_LEFT_OUT = [
  { name: 'Cais, Episódio 1', year: null, id: 'tt9028501' },
  { name: 'Cais, Episódio 2', year: null, id: 'tt9028502' },
  { name: null, year: null, id: 'tt9028503' },
]
const SIMKL_FILMS = { rated: 87, seen: 53, watchlist: 12 }
const TVTIME_FILMS = { rated: 3, seen: 1, watchlist: 1 }
const TRAKT_FILE = 'imports/quim/trakt-b1.zip'
const IMDB_FILE = 'imports/quim/imdb-c1.csv'
const SIMKL_FILE = 'imports/quim/simkl-d1.zip'
const TVTIME_RECORD = {
  kind: 'tvtime',
  file: 'imports/quim/tvtime-d1.zip',
  date: '2026-11-23',
  original: 'gdpr-data.zip',
}
const LOST = {
  id: 'filme-perdido-91d7fc73cdee',
  name: 'Filme Perdido',
  year: null,
  reason: 'o export não traz o ano do filme',
}
const TVTIME_FACTS = { ratings: 3, seen: 4, stated: 0, watchlist: 1 }

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
  tvtime: { ratings: 0, seen: 0, stated: 0, watchlist: 0 },
  films: {
    trakt: { rated: 2, seen: 0, watchlist: 0 },
    imdb: { rated: 412, seen: 0, watchlist: 0 },
    simkl: SIMKL_FILMS,
    tvtime: NO_FILMS,
  },
  leftOut: NO_LEFT_OUT,
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
  films: FILMS,
}

/** Quim with only the IMDb CSV. */
const IMDB_ONLY: PersonImportsView = {
  ...EMPTY,
  imports: QUIM.imports.filter(({ kind }) => kind === 'imdb'),
  imdb: { ratings: 412 },
  films: { ...FILMS, imdb: QUIM.films.imdb },
  leftOut: { ...NO_LEFT_OUT, imdb: IMDB_LEFT_OUT },
}

/** Quim with only the Simkl backup. */
const SIMKL_ONLY: PersonImportsView = {
  ...EMPTY,
  imports: QUIM.imports.filter(({ kind }) => kind === 'simkl'),
  simkl: QUIM.simkl,
  films: { ...FILMS, simkl: SIMKL_FILMS },
}

/** Quim with the TV Time backup too: its films join the Letterboxd ones in
 * the resolution. */
const WITH_TVTIME: PersonImportsView = {
  ...QUIM,
  imports: [...QUIM.imports, TVTIME_RECORD],
  letterboxd: {
    ...QUIM.letterboxd,
    films: 15,
    resolved: { wikidata: 8, tmdb: 2, manual: 0 },
    queued: 2,
    queue: [LOST, ...QUIM.letterboxd.queue],
  },
  tvtime: TVTIME_FACTS,
  films: { ...QUIM.films, tvtime: TVTIME_FILMS },
}

/** Quim with only the TV Time backup. */
const TVTIME_ONLY: PersonImportsView = {
  ...EMPTY,
  imports: [TVTIME_RECORD],
  letterboxd: {
    ...EMPTY.letterboxd,
    films: 6,
    resolved: { wikidata: 3, tmdb: 1, manual: 0 },
    queued: 2,
    queue: [LOST, ...QUIM.letterboxd.queue],
  },
  tvtime: TVTIME_FACTS,
  films: { ...FILMS, tvtime: TVTIME_FILMS },
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

/** Her own page with Trakt on the site and not connected: the way to
 * connect stays in what came in, though the forms fold away (#274). */
export const Own: Story = {
  args: {
    slug: 'quim',
    page: {
      ...QUIM,
      own: true,
      traktLink: { available: true, connected: false },
    },
  },
  play: async ({ canvasElement }) => {
    const results = within(
      within(canvasElement).getByRole('region', {
        name: PERSON_IMPORTS.results.title,
      }),
    )
    await expect(
      results.getByRole('link', { name: PERSON_IMPORTS.results.traktConnect }),
    ).toHaveAttribute('href', '/trakt')
  },
}

export const NothingYet: Story = { args: { page: EMPTY } }

export const Imported: Story = {
  args: {
    done: { notice: 'trakt', facts: 3, ratings: 2, seen: 1, outside: 2 },
  },
}

/** Trakt refused her connection: the read went by her username, and the
 * notice asks her to connect again. */
export const TraktReconnect: Story = {
  args: {
    done: { notice: 'reconectar', facts: 3, ratings: 2, seen: 1 },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(
        PERSON_IMPORTS.notices.reconectar({ facts: 3, ratings: 2, seen: 1 }),
      ),
    ).toBeVisible()
  },
}

/** The IMDb CSV left 3 titles out: the card keeps them, folded, as the
 * Letterboxd one does (#348). */
export const OnlyImdb: Story = {
  args: { page: IMDB_ONLY },
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText(PERSON_IMPORTS.results.site('IMDb', QUIM.films.imdb)),
    ).toBeVisible()
    await userEvent.click(
      canvas.getByText(PERSON_IMPORTS.results.seeOutside(3)),
    )
    await expect(canvas.getByText('Cais, Episódio 1')).toBeVisible()
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
      within(canvasElement).getByText(
        PERSON_IMPORTS.results.site('Simkl', SIMKL_FILMS),
      ),
    ).toBeVisible()
  },
}

export const SimklImported: Story = {
  args: {
    page: SIMKL_ONLY,
    done: { notice: 'simkl', facts: 239, ratings: 87, seen: 140, outside: 4 },
  },
}

/** The TV Time backup's films go through the Letterboxd resolution: the
 * heading names both, and the counts get their own line. */
export const WithTvTime: Story = {
  args: { page: WITH_TVTIME },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', {
        name: PERSON_IMPORTS.results.letterboxd(15, 'both'),
      }),
    ).toBeVisible()
    await expect(
      canvas.getByText(PERSON_IMPORTS.results.site('TV Time', TVTIME_FILMS)),
    ).toBeVisible()
    await expect(
      canvas.getByText(PERSON_IMPORTS.results.queued(2, 'both')),
    ).toBeVisible()
  },
}

export const TvTimeImported: Story = {
  args: {
    page: TVTIME_ONLY,
    done: { notice: 'tvtime', facts: 8, ratings: 3, seen: 4, outside: 1 },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText(
        PERSON_IMPORTS.notices.tvtime({
          facts: 8,
          ratings: 3,
          seen: 4,
          outside: 1,
        }),
      ),
    ).toBeVisible()
    await expect(
      canvas.getByRole('heading', {
        name: PERSON_IMPORTS.results.letterboxd(6, 'tvtime'),
      }),
    ).toBeVisible()
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
