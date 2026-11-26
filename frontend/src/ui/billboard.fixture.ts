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
          text: 'dirigido por Helena Prado, como 2 filmes a que deu Nota alta',
          source: 'Wikidata',
        },
      ],
      withoutFact: [],
      coverage: 'Fato sobre 2 de 2',
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
