// Where Meu gosto and the Pessoas' screens live since the layout pass (#219,
// map #218): Meu gosto is the logged-in Dono's own Pessoa page, with her
// Notas, import and queue under it; the export is a download from the
// Notas section of any Pessoa's page (#222). The Sessões' are in
// `session-paths.ts`.
// The old paths (`/notas`, `/fila`, `/exportar`, `/importar`, `/feedback`)
// redirect here (`moved.ts`). Shared by the pages and the server routes that answer a
// form. Client-safe.

const slug = (value: string) => encodeURIComponent(value)

export const MY_TASTE = '/meu-gosto'
export const RATINGS_PATH = `${MY_TASTE}/notas`
export const QUEUE_PATH = `${MY_TASTE}/fila`

/** The path whose tab the bar marks: another Pessoa's queue (`?de=`,
 * from her import page) is hers, under Pessoas, though its address is
 * Meu gosto's (#348). */
export const tabPath = (
  pathname: string,
  search: { readonly de?: unknown },
  viewer: string,
) =>
  pathname === QUEUE_PATH &&
  typeof search.de === 'string' &&
  search.de !== viewer
    ? '/pessoas'
    : pathname

/** A Pessoa's page: Meu gosto when she is the Dono logged in (`self`). */
export const personPath = (person: string, self: boolean) =>
  self ? MY_TASTE : `/pessoas/${slug(person)}`

/** A Pessoa's import page, under her page. */
export const importsPath = (person: string, self: boolean) =>
  `${personPath(person, self)}/importar`

/** The download of her Notas as the IMDb CSV. */
export const imdbCsvPath = (person: string) =>
  `/exportar/imdb.csv?pessoa=${slug(person)}`

/** The download of her Notas and Já vistos as the CSV Letterboxd imports. */
export const letterboxdCsvPath = (person: string) =>
  `/exportar/letterboxd.csv?pessoa=${slug(person)}`
