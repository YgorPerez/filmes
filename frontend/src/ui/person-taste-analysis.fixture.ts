// The taste analysis's data for its story and its test: the fixture's
// Bruno, read on his own Escala.
import type { TasteAnalysis, TasteItem } from '@filmes/engine'

const film = (filmId: string, title: string, year: number, rating: number) => ({
  filmId,
  title,
  year,
  rating,
})

const HELENA: TasteItem = {
  key: 'Q9000001',
  label: 'Helena Prado',
  mean: 4.5,
  count: 3,
  films: [
    film('tt9000101', 'O Farol de Areia', 2012, 5),
    film('tt9000102', 'Maré Baixa', 2015, 4.5),
    film('tt9000103', 'Cidade de Vidro', 2018, 4),
  ],
}

/** Every group with something, and a genre with more films than shown. */
export const ANALYSIS: TasteAnalysis = {
  ratings: 120,
  median: 3.5,
  genres: [
    {
      key: 'Drama',
      label: 'Drama',
      mean: 4.1,
      count: 14,
      films: Array.from({ length: 10 }, (_, i) =>
        film(
          `tt90001${String(i).padStart(2, '0')}`,
          `Drama ${i + 1}`,
          2010 + i,
          5 - i / 4,
        ),
      ),
    },
    { ...HELENA, key: 'Crime', label: 'Crime', mean: 4.25, count: 2 },
  ],
  directors: [
    HELENA,
    {
      key: 'Q9000004',
      label: 'Rui Tavares',
      mean: 4.5,
      count: 2,
      films: [
        film('tt9000401', 'Fronteira', 2008, 5),
        film('tt9000402', 'Inverno em Lisboa', 2011, 4),
      ],
    },
  ],
  actors: [
    {
      key: 'Q9001902',
      label: 'Rita Lobo',
      mean: 4.75,
      count: 2,
      films: [
        film('tt9001902', 'Voo Noturno', 2021, 5),
        film('tt9000201', 'Ponte Aérea', 2016, 4.5),
      ],
    },
  ],
  decades: [
    {
      key: '2010',
      label: '2010',
      mean: 13 / 3,
      count: 3,
      films: [
        film('tt9000201', 'Ponte Aérea', 2016, 5),
        film('tt9000501', 'Barulho', 2013, 4.5),
        film('tt9000102', 'Maré Baixa', 2015, 3.5),
      ],
    },
  ],
}

/** Enough Notas, but nothing above the median in two films. */
export const NOTHING_ABOVE: TasteAnalysis = {
  ratings: 25,
  median: 4,
  genres: [],
  directors: [],
  actors: [],
  decades: [],
}
