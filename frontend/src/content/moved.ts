// The pages the layout pass (#219, map #218) moved: each old path's route
// redirects to where its screen lives now, and the Dono's own Pessoa page
// is Meu gosto. Client-safe.

import { redirect } from '@tanstack/react-router'
import { importsPath, MY_TASTE, QUEUE_PATH, RATINGS_PATH } from './paths'
import { feedbackPath, SESSIONS_PATH } from './session-paths'

/** Where each old page went. */
export const MOVED_TO = {
  myTaste: MY_TASTE,
  ratings: RATINGS_PATH,
  queue: QUEUE_PATH,
  // The export page became the download in Meu gosto's Notas (#222).
  export: MY_TASTE,
  imports: `${MY_TASTE}/importar`,
  personImports: (person: string) => importsPath(person, false),
  openSessions: SESSIONS_PATH,
  feedback: feedbackPath,
}

/** An old path's page: off to where the screen lives now, with the same
 * query (a form's `feito` or `erro` still reaches it). */
export function moved(path: string, search: string): never {
  throw redirect({ href: `${path}${search}` })
}
