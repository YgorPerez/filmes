// A Session's fields as the engine gives them (`openSessions`,
// `listSessions`, `readSession`: YAML read back as `unknown`), typed for the
// screens that show a Session (Sessões, Feedback, the Link da Sessão).

/** A film of a Session's current Recomendação. */
export type SessionFilm = { position: number; id: string; title: string }

type Item = { position?: unknown; id?: unknown; title?: unknown }

/** The Recomendação's films; a film with no title shows its id. */
export const sessionFilms = (recommendation: unknown): SessionFilm[] =>
  (Array.isArray(recommendation) ? (recommendation as Item[]) : []).map(
    (item) => ({
      position: Number(item.position),
      id: String(item.id),
      title: typeof item.title === 'string' ? item.title : String(item.id),
    }),
  )

/** The Presentes' slugs. */
export const attendeeSlugs = (attendees: unknown): string[] =>
  Array.isArray(attendees) ? attendees.map(String) : []
