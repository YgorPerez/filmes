// Bruno's Compatibilidade with Iara and Quim, for the test and the story.
import type { Compatibility } from '@filmes/engine'

export const BRUNO_COMPATIBILITY: Compatibility = {
  person: 'bruno',
  minShared: 2,
  others: [
    {
      person: 'iara',
      name: 'Iara',
      shared: 2,
      agreement: 0.61,
      agree: [
        {
          filmId: 'tt9000401',
          title: 'Fronteira',
          year: 2008,
          mine: 10,
          theirs: 8,
        },
      ],
      diverge: [
        {
          filmId: 'tt9000101',
          title: 'O Farol de Areia',
          year: 2012,
          mine: 10,
          theirs: 6,
        },
      ],
    },
    {
      person: 'quim',
      name: 'Quim',
      shared: 4,
      agreement: 0.4725,
      agree: [
        {
          filmId: 'tt9000201',
          title: 'Ponte Aérea',
          year: 2016,
          mine: 9,
          theirs: 10,
        },
        {
          filmId: 'tt9000102',
          title: 'Maré Baixa',
          year: 2015,
          mine: 9,
          theirs: 7,
        },
      ],
      diverge: [
        {
          filmId: 'tt9000501',
          title: 'Barulho',
          year: 2013,
          mine: 2,
          theirs: 9,
        },
        {
          filmId: 'tt9000401',
          title: 'Fronteira',
          year: 2008,
          mine: 10,
          theirs: 4,
        },
      ],
    },
  ],
}
