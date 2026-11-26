// What a form route has to tell the page it redirects to and does not fit
// the query: the Recomendação's warnings (a missing key, "só N passaram nas
// Restrições"), the acrescentar the Dono wrote, and Nova Sessão as "Ler"
// filled it, with what it read (the sentence never goes in the URL, which
// logs and history keep). The Session file does
// not keep them, so the route keeps them here, in the process, under a
// random token the redirect carries (`?nota=`), for a while. A restart
// forgets them: the page then shows the Cartaz without them. Server only.

import { randomUUID } from 'node:crypto'
import type { FeedbackDraft } from '#/content/feedback-form'
import type { SessionRequestForm } from '#/content/session-request'
import type { PageReading } from './reading'

export type Note = {
  readonly warnings: readonly string[]
  readonly addition: string | null
  /** What the Leitura do pedido made of the acrescentar or of the
   * sentence "Ler" read; absent when there was none or it could not be
   * read. */
  readonly reading?: PageReading
  /** Nova Sessão's fields as "Ler" left them (#199). */
  readonly form?: Partial<SessionRequestForm>
  /** The Feedback form's reactions and comments as the Catálogo search
   * left them. */
  readonly feedback?: FeedbackDraft
}

/** How long a note lasts, and how many the process keeps at most. */
const LIFETIME_MS = 30 * 60 * 1000
const MOST = 200

export class Notes {
  readonly #notes = new Map<string, { note: Note; at: number }>()

  constructor(private readonly now: () => number = Date.now) {}

  /** Keeps `note` and gives its token; none when there is nothing to
   * say. */
  remember(note: Note): string | undefined {
    if (
      note.warnings.length === 0 &&
      !note.addition &&
      !note.form &&
      !note.feedback
    )
      return undefined
    this.#forgetOld()
    const token = randomUUID()
    this.#notes.set(token, { note, at: this.now() })
    return token
  }

  /** The note under `token`, while it lasts. A reload shows it again. */
  recall(token: string | undefined): Note | null {
    this.#forgetOld()
    return (token && this.#notes.get(token)?.note) || null
  }

  #forgetOld() {
    const oldest = this.now() - LIFETIME_MS
    for (const [token, { at }] of this.#notes)
      if (at < oldest || this.#notes.size > MOST) this.#notes.delete(token)
  }
}

let notes: Notes | undefined

/** The process's notes. */
export const appNotes = () => (notes ??= new Notes())
