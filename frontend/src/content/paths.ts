// Where Meu gosto and the Pessoas' screens live since the layout pass (#219,
// map #218): Meu gosto is the logged-in Dono's own Pessoa page, with her
// Notas, import, export and queue under it. The Sessões' are in
// `session-paths.ts`.
// The old paths (`/notas`, `/fila`, `/exportar`, `/importar`, `/feedback`)
// redirect here (`moved.ts`). Shared by the pages and the server routes that answer a
// form. Client-safe.

const slug = (value: string) => encodeURIComponent(value)

export const MY_TASTE = '/meu-gosto'
export const RATINGS_PATH = `${MY_TASTE}/notas`
export const QUEUE_PATH = `${MY_TASTE}/fila`
export const EXPORT_PATH = `${MY_TASTE}/exportar`

/** A Pessoa's page: Meu gosto when she is the Dono logged in (`self`). */
export const personPath = (person: string, self: boolean) =>
  self ? MY_TASTE : `/pessoas/${slug(person)}`

/** A Pessoa's import page, under her page. */
export const importsPath = (person: string, self: boolean) =>
  `${personPath(person, self)}/importar`
