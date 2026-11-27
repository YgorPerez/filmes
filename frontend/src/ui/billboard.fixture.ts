// A Cartaz as `billboardModel` gives it, for the component tests: Bruno
// (the Dono) and Iara, a redone version with one film that came in and one
// that left. The fixture's films and texts (`tests/fixture`).

import type { Billboard } from '@filmes/engine'

export const MODEL: Billboard = {
  session: '2026-11-20-iara',
  version: 2,
  title: 'Recomendação de 2026-11-20',
  open: true,
  attendees: [
    {
      slug: 'bruno',
      name: 'Bruno',
      label: 'Você',
      initial: 'B',
      color: 1,
      owner: true,
    },
    {
      slug: 'iara',
      name: 'Iara',
      label: 'Iara',
      initial: 'I',
      color: 2,
      owner: false,
    },
  ],
  request: {
    speech: 'algo leve pra hoje',
    who: 'Vocês dois',
    parts: ['até 2h05', 'nota 7+ no IMDb', 'leve'],
  },
  moods: ['leve'],
  moodChoices: ['leve', 'pra rir', 'tenso'],
  dropped: [
    {
      position: 2,
      id: 'tt9001106',
      title: 'Sessão Maldita',
      cause: 'seen',
      people: ['iara'],
      reason: 'Iara já viu',
    },
  ],
  films: [
    {
      position: 1,
      id: 'tt9000104',
      title: 'As Horas Lentas',
      originalTitle: null,
      new: false,
      bet: false,
      poster: 'https://image.tmdb.org/t/p/w500/hOrAsLeNtAs9104.jpg',
      imdbUrl: 'https://www.imdb.com/title/tt9000104/',
      trailer: 'https://www.youtube.com/watch?v=hOrAsPtBr01',
      imdbRating: 7.4,
      imdbRatingText: '7,4',
      votesText: '28 mil',
      chips: ['2021', '1h44', 'Drama', 'Mistério'],
      synopsis:
        'Numa cidade do interior, uma relojoeira percebe que os relógios da casa atrasam um minuto por noite.',
      lines: [
        {
          people: ['bruno', 'iara'],
          strength: 'moderate',
          text: 'dirigido por Helena Prado, como 2 filmes a que deu nota alta',
          source: 'Wikidata',
        },
      ],
      withoutFact: [],
      coverage: 'Fato sobre 2 de 2',
      predictedRatings: [
        { person: 'bruno', value: 8.31, text: '8,3', raters: 12 },
      ],
    },
    {
      position: 2,
      id: 'tt9000105',
      title: 'Sal & Ferrugem',
      originalTitle: 'Sal e Ferrugem',
      new: true,
      bet: true,
      poster: null,
      imdbUrl: 'https://www.imdb.com/title/tt9000105/',
      imdbRating: null,
      imdbRatingText: null,
      votesText: '870',
      chips: [],
      synopsis: null,
      lines: [
        {
          people: ['bruno'],
          strength: 'strong',
          text: 'deu 5 a Maré Baixa',
          source: null,
        },
      ],
      withoutFact: ['iara'],
      coverage: 'Fato sobre 1 de 2',
      predictedRatings: [],
    },
  ],
  sections: [
    {
      kind: 'entity',
      title: 'Porque você e Iara gostam de Helena Prado',
      again: false,
      films: ['tt9000104'],
    },
    { kind: 'bet', title: 'Aposta', again: false, films: ['tt9000105'] },
  ],
}

const [HOURS, SALT] = MODEL.films

/** The same Cartaz once the Session has its Feedback (#264): they chose
 * As Horas Lentas; Bruno, with a Nota prevista of 8,3, gave it 6 out of 10;
 * Iara, with none, liked it. */
export const CLOSED: Billboard = {
  ...MODEL,
  open: false,
  films: [
    {
      ...HOURS!,
      reactions: [
        { person: 'bruno', predicted: '8,3', rating: '6', reaction: null },
        { person: 'iara', predicted: null, rating: null, reaction: 'liked' },
      ],
    },
    SALT!,
  ],
}

/** A closed Cartaz whose chosen film has no card: they watched Curta da
 * Madrugada, outside the Recomendação. Bruno gave it 8; Iara did not
 * like it. */
export const CHOSEN_OUTSIDE: Billboard = {
  ...MODEL,
  open: false,
  chosen: {
    id: 'tt9000106',
    title: 'Curta da Madrugada',
    year: 2010,
    reactions: [
      { person: 'bruno', predicted: null, rating: '8', reaction: null },
      { person: 'iara', predicted: null, rating: null, reaction: 'disliked' },
    ],
  },
}
