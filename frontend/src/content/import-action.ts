// What the Imports pages can ask and what they hear back in their query.
// A Pessoa's imports page posts to `/importar/<slug>/acao` (an upload, the
// RSS, removing an import); the resolution queue posts to `/fila/acao`.
// Shared by the pages and the server (`platform/imports.ts`), so nothing
// here imports the engine.

import { field, within } from './form-fields'

/** A file as uploaded (a ZIP, IMDb's CSV or Simkl's JSON): its name and its
 * bytes. */
type Upload = { original: string; content: Uint8Array }

/** What the Dono asks on a Pessoa's imports page. The upload says nothing
 * of where the file came from: the server tells it by what is inside. */
export type ImportAction =
  | ({ kind: 'upload' } & Upload)
  | { kind: 'rss'; user: string }
  | { kind: 'remove'; file: string }
  // Her Trakt by the API (#269): a public username, or null for her
  // connected account or the username she was linked to before.
  | { kind: 'trakt-sync'; user: string | null }

/** What the engine runs: the upload once its service is known. */
export type ImportRun =
  | ({ kind: 'letterboxd' | 'trakt' | 'imdb' | 'simkl' } & Upload)
  | Exclude<ImportAction, { kind: 'upload' }>

/** What the Dono decides on the queue. */
export type QueueAction =
  | { kind: 'confirm'; id: string; film: string }
  | { kind: 'discard'; id: string; reason: string }
  | { kind: 'reprocess' }

/** The biggest upload the server reads: a Letterboxd, Trakt or Simkl
 * export of years of films, or IMDb's CSV, is a few megabytes. Nginx lets 25 MB
 * through. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

/** A Letterboxd user, as the engine takes it. */
const LETTERBOXD_USER = '[A-Za-z0-9_]+'

const USER_FORMS = [
  new RegExp(`^@?(${LETTERBOXD_USER})$`),
  new RegExp(
    `^(?:https?://)?(?:www\\.)?letterboxd\\.com/(${LETTERBOXD_USER})(?:[/?#].*)?$`,
    'i',
  ),
]

/** The user in what the Dono typed: `ygorperez`, `@ygorperez` or the
 * profile's address (`https://letterboxd.com/ygorperez/`); null when it is
 * none of them. */
function letterboxdUser(typed: string): string | null {
  for (const form of USER_FORMS) {
    const user = form.exec(typed)?.[1]
    if (user !== undefined) return user
  }
  return null
}

/** A Trakt user as its profile's address has it. */
const TRAKT_USER = '[A-Za-z0-9][A-Za-z0-9_.-]*'

const TRAKT_FORMS = [
  new RegExp(`^@?(${TRAKT_USER})$`),
  new RegExp(
    `^(?:https?://)?(?:www\\.|app\\.)?trakt\\.tv/users/(${TRAKT_USER})(?:[/?#].*)?$`,
    'i',
  ),
]

/** The user in what the Dono typed: `olga`, `@olga` or the profile's
 * address (`https://trakt.tv/users/olga`); null when it is none of them. */
function traktUser(typed: string): string | null {
  for (const form of TRAKT_FORMS) {
    const user = form.exec(typed.trim())?.[1]
    if (user !== undefined) return user
  }
  return null
}

/** The reason a discard records when the Dono gives none (the CLI's
 * default). */
const DEFAULT_DISCARD_REASON = 'ignorar'

/** Why an import form cannot run, before the engine sees it. */
export type ImportFormError =
  | 'pedido'
  | 'arquivo'
  | 'consentimento'
  | 'trakt-usuario'

/** The form → the action. An upload with no file is `arquivo`; the RSS
 * without the Pessoa's consent is `consentimento`, unless `own` (the Dono's
 * own page, where she answers for herself). */
export async function parseImport(
  form: FormData,
  own = false,
): Promise<ImportAction | ImportFormError> {
  const action = field(form, 'acao')
  if (action === 'arquivo') {
    const file = form.get('arquivo')
    if (file === null || typeof file === 'string' || file.size === 0)
      return 'arquivo'
    return {
      kind: 'upload',
      original: file.name || 'import.zip',
      content: new Uint8Array(await file.arrayBuffer()),
    }
  }
  if (action === 'rss') {
    const user = letterboxdUser(field(form, 'usuario') ?? '')
    if (user === null) return 'pedido'
    if (!own && field(form, 'consentimento') !== 'sim') return 'consentimento'
    return { kind: 'rss', user }
  }
  if (action === 'remover') {
    const file = field(form, 'arquivo')
    return file ? { kind: 'remove', file } : 'pedido'
  }
  if (action === 'trakt') {
    const typed = field(form, 'usuario')
    if (!typed) return { kind: 'trakt-sync', user: null }
    const user = traktUser(typed)
    if (user === null) return 'trakt-usuario'
    if (!own && field(form, 'consentimento') !== 'sim') return 'consentimento'
    return { kind: 'trakt-sync', user }
  }
  return 'pedido'
}

export function parseQueue(form: FormData): QueueAction | null {
  const action = field(form, 'acao')
  if (action === 'reprocessar') return { kind: 'reprocess' }
  const id = field(form, 'id')
  if (!id) return null
  if (action === 'confirmar') {
    const film = field(form, 'filme')
    return film ? { kind: 'confirm', id, film } : null
  }
  if (action === 'descartar')
    return {
      kind: 'discard',
      id,
      reason: field(form, 'motivo') ?? DEFAULT_DISCARD_REASON,
    }
  return null
}

// --- what comes back -------------------------------------------------------------

const IMPORT_NOTICES = [
  // A ZIP, the IMDb CSV, the Simkl backup or the RSS imported: `novos`
  // Fatos more.
  'letterboxd',
  'rss',
  'trakt',
  'imdb',
  'simkl',
  // The same file again: kept once, nothing new.
  'repetido',
  // An import removed: `novos` Fatos less.
  'removido',
  // Her Trakt read by the API (#269): `novos` Fatos more.
  'sincronizado',
] as const

export type ImportNotice = (typeof IMPORT_NOTICES)[number]

const IMPORT_REFUSALS = [
  'pedido',
  // No file, or a file its service's reader refused.
  'arquivo',
  // A file of none of Letterboxd, Trakt, IMDb or Simkl.
  'origem',
  'grande',
  // The RSS without the Pessoa's yes.
  'consentimento',
  // No public RSS for that user.
  'rss',
  // Letterboxd did not answer.
  'fonte',
  // The import to remove is gone.
  'item',
  // Her Trakt by the API (#269): no such user (or not a username), a
  // private profile, nothing to read (no connection nor username), a
  // server with no Trakt, Trakt not answering.
  'trakt-usuario',
  'trakt-privado',
  'trakt-sem',
  'trakt-off',
  'trakt-fonte',
  'indisponivel',
  // The engine failed in a way waiting does not fix (#258).
  'falha',
] as const

export type ImportRefusal = (typeof IMPORT_REFUSALS)[number]

const QUEUE_NOTICES = [
  'confirmado',
  'descartado',
  // The same decision again: nothing changed.
  'igual',
  // Asked TMDB again: `resolvidos` left the queue, `restam` wait.
  'reprocessado',
] as const

export type QueueNotice = (typeof QUEUE_NOTICES)[number]

const QUEUE_REFUSALS = [
  'pedido',
  // Not a tconst, nor an IMDb or TMDB film link.
  'filme',
  // A TMDB link with no IMDb id.
  'sem-imdb',
  // Someone decided on it first.
  'item',
  'indisponivel',
  // The engine failed in a way waiting does not fix (#258).
  'falha',
] as const

export type QueueRefusal = (typeof QUEUE_REFUSALS)[number]

export const isImportNotice = within(IMPORT_NOTICES)
export const isImportRefusal = within(IMPORT_REFUSALS)
export const isQueueNotice = within(QUEUE_NOTICES)
export const isQueueRefusal = within(QUEUE_REFUSALS)

/** A count of the query: a whole number, or nothing. */
export const countOf = (value: unknown): number | undefined => {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^[0-9]+$/.test(value)
        ? Number(value)
        : NaN
  return Number.isSafeInteger(n) && n >= 0 ? n : undefined
}

export { IMPORT_NOTICES, IMPORT_REFUSALS, QUEUE_NOTICES, QUEUE_REFUSALS }
