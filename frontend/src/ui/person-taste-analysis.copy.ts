// The words of the taste analysis on the Pessoa page (#404).

/** A Nota or a mean of 0,5 to 5, on the scale of 1 to 10, with one
 * decimal at most: "8,5". */
const tenScale = (rating: number) =>
  (Math.round(rating * 20) / 10).toLocaleString('pt-BR')

const films = (n: number) =>
  n === 1 ? '1 filme' : `${n.toLocaleString('pt-BR')} filmes`

export const TASTE_ANALYSIS = {
  title: (own: boolean, name: string) =>
    own ? 'Do que você mais gosta' : `Do que ${name} mais gosta`,
  /** What the slip holds and the median it measures from. */
  lead: (own: boolean, name: string, median: number, ratings: number) => {
    const who = own ? 'você dá' : `${name} dá`
    return `Gêneros, diretores, atores e décadas a que ${who} nota acima da própria mediana (${tenScale(median)} de 10), nas ${ratings.toLocaleString('pt-BR')} Notas.`
  },
  empty:
    'Nenhum gênero, diretor, ator ou década passa da mediana em dois filmes ou mais.',
  groups: {
    genres: 'Gêneros',
    directors: 'Diretores',
    actors: 'Atores',
    decades: 'Décadas',
  },
  decade: (year: string) => `Anos ${year}`,
  /** An item's fold: "Drama · média 9 em 3 filmes". */
  item: (label: string, mean: number, count: number) =>
    `${label} · média ${tenScale(mean)} em ${films(count)}`,
  film: (title: string, year: number | null) =>
    year === null ? title : `${title} (${year})`,
  rating: (rating: number) => `nota ${tenScale(rating)}`,
  /** Under the list, the films an item has beyond the ones shown. */
  more: (n: number) => `e mais ${films(n)}`,
}
