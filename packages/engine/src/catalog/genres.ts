// The IMDb genres in Portuguese and in Wikidata, by fixed table
// (`catalogo/generos.py`). The keys are the 28 genres `title.basics` uses.

const PORTUGUESE: Readonly<Record<string, string>> = {
  Action: 'Ação',
  Adult: 'Adulto',
  Adventure: 'Aventura',
  Animation: 'Animação',
  Biography: 'Biografia',
  Comedy: 'Comédia',
  Crime: 'Crime',
  Documentary: 'Documentário',
  Drama: 'Drama',
  Family: 'Família',
  Fantasy: 'Fantasia',
  'Film-Noir': 'Noir',
  'Game-Show': 'Game show',
  History: 'História',
  Horror: 'Terror',
  Music: 'Música',
  Musical: 'Musical',
  Mystery: 'Mistério',
  News: 'Jornalismo',
  'Reality-TV': 'Reality show',
  Romance: 'Romance',
  'Sci-Fi': 'Ficção científica',
  Short: 'Curta-metragem',
  Sport: 'Esporte',
  'Talk-Show': 'Talk show',
  Thriller: 'Suspense',
  War: 'Guerra',
  Western: 'Faroeste',
}

/** The Wikidata film genre of each IMDb genre, so a Veto to a genre also
 * holds through `title.basics`. Adult, Music, Short and the TV ones have no
 * clear Wikidata film genre and are left out. */
export const WIKIDATA_GENRE: ReadonlyMap<string, string> = new Map([
  ['Action', 'Q188473'],
  ['Adventure', 'Q319221'],
  ['Animation', 'Q202866'],
  ['Biography', 'Q645928'],
  ['Comedy', 'Q157443'],
  ['Crime', 'Q959790'],
  ['Documentary', 'Q93204'],
  ['Drama', 'Q130232'],
  ['Family', 'Q1361932'],
  ['Fantasy', 'Q157394'],
  ['Film-Noir', 'Q185867'],
  ['History', 'Q17013749'],
  ['Horror', 'Q200092'],
  ['Musical', 'Q842256'],
  ['Mystery', 'Q1200678'],
  ['Romance', 'Q1054574'],
  ['Sci-Fi', 'Q471839'],
  ['Sport', 'Q1339864'],
  ['Thriller', 'Q2484376'],
  ['War', 'Q369747'],
  ['Western', 'Q172980'],
])

/** The genre in Portuguese; one the table does not know stays as the IMDb
 * wrote it, so it does not vanish from the card. */
export const genreInPortuguese = (genre: string): string =>
  PORTUGUESE[genre] ?? genre
