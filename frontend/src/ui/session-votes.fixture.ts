import type { BillboardPerson } from '@filmes/engine'
import type { DeckFilm, FilmSheet, VoteDeck } from '#/platform/session-votes'
import { FILMS, VIEW, VOTED } from './session-link.fixture'

// The swipe's deck as the stories and tests see it (#377): the link's
// films with their full sheets, as Iara (a guest: only her own Evidence
// and Nota prevista) and as Bruno, the Dono (everyone's).

const person = (
  slug: string,
  name: string,
  color: number,
  you: boolean,
): BillboardPerson => ({
  slug,
  name,
  label: you ? 'Você' : name,
  initial: name.slice(0, 1),
  color,
  owner: you,
})

/** Whom Iara's sheets name: herself, as "Você". */
export const IARA_SEES = [person('iara', 'Iara', 2, true)]

/** Whom Bruno's sheets name: every Presente, he is "Você". */
const BRUNO_SEES = [
  person('bruno', 'Bruno', 1, true),
  person('iara', 'Iara', 2, false),
  person('quim', 'Quim', 3, false),
]

/** Everyone's sheet of a film, as the Dono gets it. */
const everyone = (id: string, chips: string[]): FilmSheet => ({
  imdbUrl: `https://www.imdb.com/title/${id}/`,
  imdbRatingText: '7,6',
  votesText: '12 mil',
  chips,
  synopsis: FILMS.find((f) => f.id === id)?.card?.synopsis ?? null,
  lines: [
    {
      people: ['bruno'],
      strength: 'strong',
      text: 'dirigido por Helena Prado, como 2 filmes a que deu nota alta',
      source: null,
      against: false,
    },
    {
      people: ['iara'],
      strength: 'moderate',
      text: 'deu 9 de 10 a Fronteira (2008), também de Helena Prado',
      source: 'Letterboxd, 2025-03-02',
      against: false,
    },
  ],
  withoutFact: ['quim'],
  coverage: 'Fato sobre 2 de 3',
  predictedRatings: [
    { person: 'bruno', value: 8.3, text: '8,3', raters: 4 },
    { person: 'iara', value: 7.1, text: '7,1' },
  ],
})

/** The sheet with only `who`'s lines and Notas previstas, as the server
 * sends a guest hers. */
const onlyOf = (sheet: FilmSheet, who: string): FilmSheet => ({
  ...sheet,
  lines: sheet.lines.filter((l) => l.people.includes(who)),
  withoutFact: sheet.withoutFact.filter((p) => p === who),
  coverage: 'Fato sobre 1 de 1',
  predictedRatings: sheet.predictedRatings.filter((p) => p.person === who),
})

const SHEETS = new Map(
  FILMS.map((f) => [
    f.id,
    {
      ...everyone(f.id, [
        String(f.card?.year ?? ''),
        f.card?.duration ?? '',
        ...(f.card?.genres ?? []),
      ]),
      ...(f.position === 1 && {
        trailer: 'https://www.youtube.com/watch?v=farol',
        awards: ['Vencedor do Oscar de Melhor Fotografia'],
        critics: ['93% no Rotten Tomatoes'],
      }),
    },
  ]),
)

const withSheets = (films: typeof FILMS, who: string | null): DeckFilm[] =>
  films.map((f) => {
    const sheet = SHEETS.get(f.id) ?? null
    return {
      ...f,
      sheet: sheet && who !== null ? onlyOf(sheet, who) : sheet,
    }
  })

/** The link's films as Iara's deck has them. */
export const GUEST_FILMS = withSheets(FILMS, 'iara')

/** Iara's deck, before she voted. */
export const GUEST_DECK: VoteDeck = {
  version: VIEW.version,
  films: GUEST_FILMS,
  left: [],
  people: IARA_SEES,
}

/** Bruno's deck: every Presente's sheet. */
export const OWNER_DECK: VoteDeck = {
  ...GUEST_DECK,
  films: withSheets(FILMS, null),
  people: BRUNO_SEES,
}

/** Iara's deck after she voted. */
export const GUEST_AFTER: VoteDeck = {
  version: VOTED.version,
  films: withSheets(VOTED.films, 'iara'),
  left: VOTED.left,
  people: IARA_SEES,
}
