import type { SessionLinkView } from '#/platform/session-link'

// A Link da Sessão as the stories and tests see it: Bruno opened the
// Session for Iara and Quim; Iara is the one looking.

const card = (
  id: string,
  title: string,
  year: number,
  duration: string,
  genres: string[],
  synopsis: string,
) => ({
  id,
  title,
  originalTitle: null,
  year,
  duration,
  genres,
  // No network in the stories: the tape shows the title, as without a
  // poster.
  poster: null,
  imdbRating: '7,6',
  synopsis,
})

export const PEOPLE = [
  { person: 'bruno', name: 'Bruno', initial: 'B', color: 1, owner: true },
  { person: 'iara', name: 'Iara', initial: 'I', color: 2, owner: false },
  { person: 'quim', name: 'Quim', initial: 'Q', color: 3, owner: false },
]

export const FILMS: SessionLinkView['films'] = [
  {
    position: 1,
    id: 'tt9000101',
    title: 'O Farol de Areia',
    mine: null,
    card: card(
      'tt9000101',
      'O Farol de Areia',
      2012,
      '1h44',
      ['Drama', 'Mistério'],
      'Uma faroleira descobre que a ilha onde vive está afundando.',
    ),
  },
  {
    position: 2,
    id: 'tt9000601',
    title: 'Pequenos Milagres',
    mine: null,
    card: card(
      'tt9000601',
      'Pequenos Milagres',
      2019,
      '1h38',
      ['Comédia', 'Família'],
      'Três irmãos tentam salvar a padaria do avô em um verão.',
    ),
  },
  {
    position: 3,
    id: 'tt9000701',
    title: 'Noite de Estreia',
    mine: null,
    card: card(
      'tt9000701',
      'Noite de Estreia',
      2021,
      '2h05',
      ['Drama'],
      'Na véspera da estreia, a atriz principal some.',
    ),
  },
]

export const VIEW: SessionLinkView = {
  session: '2026-11-20-iara-quim',
  version: 2,
  date: '2026-11-20',
  owner: 'Bruno',
  attendees: PEOPLE,
  selected: PEOPLE[1] ?? null,
  shelf: ['até 2h10', 'leve'],
  films: FILMS,
  left: [],
  questions: 10,
}

/** After Iara voted: a sim, a não that took a film out, a newcomer. */
export const VOTED: SessionLinkView = {
  ...VIEW,
  version: 3,
  films: [
    { ...FILMS[0]!, mine: 'yes' },
    { ...FILMS[2]!, position: 2, mine: 'yes' },
    {
      ...FILMS[1]!,
      position: 3,
      id: 'tt9000801',
      title: 'Ponte Aérea',
      mine: null,
      card: null,
    },
  ],
  left: ['Sal e Ferrugem'],
}
