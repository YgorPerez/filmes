// What the Imports pages can ask and what they hear back in their query.
// A Pessoa's imports page posts to `/importar/<slug>/acao` (an upload, the
// RSS, removing an import); the resolution queue posts to `/fila/acao`.
// Shared by the pages and the server (`platform/imports.ts`), so nothing
// here imports the engine.

/** What the Dono asks on a Pessoa's imports page. */
export type ImportAction =
  | { kind: 'letterboxd' | 'trakt'; original: string; content: Uint8Array }
  | { kind: 'rss'; user: string }
  | { kind: 'remove'; file: string }

/** What the Dono decides on the queue. */
export type QueueAction =
  | { kind: 'confirm'; id: string; film: string }
  | { kind: 'discard'; id: string; reason: string }
  | { kind: 'reprocess' }

/** The biggest upload the server reads: a Letterboxd or Trakt export of
 * years of films is a few megabytes. Nginx lets 25 MB through. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

/** A Letterboxd user, as the engine takes it. */
export const LETTERBOXD_USER = '[A-Za-z0-9_]+'

/** The reason a discard records when the Dono gives none (the CLI's
 * default). */
const DEFAULT_DISCARD_REASON = 'ignorar'

const text = (form: FormData, name: string): string | undefined => {
  const value = form.get(name)
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/** Why an import form cannot run, before the engine sees it. */
export type ImportFormError = 'pedido' | 'arquivo' | 'consentimento'

/** The form → the action. An upload with no file is `arquivo`; the RSS
 * without the Pessoa's consent is `consentimento`. */
export async function parseImport(
  form: FormData,
): Promise<ImportAction | ImportFormError> {
  const action = text(form, 'acao')
  if (action === 'letterboxd' || action === 'trakt') {
    const file = form.get('arquivo')
    if (file === null || typeof file === 'string' || file.size === 0)
      return 'arquivo'
    return {
      kind: action,
      original: file.name || `${action}.zip`,
      content: new Uint8Array(await file.arrayBuffer()),
    }
  }
  if (action === 'rss') {
    const user = text(form, 'usuario')
    if (!user || !new RegExp(`^${LETTERBOXD_USER}$`).test(user)) return 'pedido'
    if (text(form, 'consentimento') !== 'sim') return 'consentimento'
    return { kind: 'rss', user }
  }
  if (action === 'remover') {
    const file = text(form, 'arquivo')
    return file ? { kind: 'remove', file } : 'pedido'
  }
  return 'pedido'
}

export function parseQueue(form: FormData): QueueAction | null {
  const action = text(form, 'acao')
  if (action === 'reprocessar') return { kind: 'reprocess' }
  const id = text(form, 'id')
  if (!id) return null
  if (action === 'confirmar') {
    const film = text(form, 'filme')
    return film ? { kind: 'confirm', id, film } : null
  }
  if (action === 'descartar')
    return {
      kind: 'discard',
      id,
      reason: text(form, 'motivo') ?? DEFAULT_DISCARD_REASON,
    }
  return null
}

// --- what comes back -------------------------------------------------------------

const IMPORT_NOTICES = [
  // An export or the RSS imported: `novos` Fatos more.
  'letterboxd',
  'rss',
  'trakt',
  // The same file again: kept once, nothing new.
  'repetido',
  // An import removed: `novos` Fatos less.
  'removido',
] as const

export type ImportNotice = (typeof IMPORT_NOTICES)[number]

const IMPORT_REFUSALS = [
  'pedido',
  // No file, or a file that is not the export the form asked for.
  'arquivo',
  'grande',
  // The RSS without the Pessoa's yes.
  'consentimento',
  // No public RSS for that user.
  'rss',
  // Letterboxd did not answer.
  'fonte',
  // The import to remove is gone.
  'item',
  'indisponivel',
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
] as const

export type QueueRefusal = (typeof QUEUE_REFUSALS)[number]

const oneOf =
  <T extends string>(values: readonly T[]) =>
  (value: unknown): value is T =>
    (values as readonly unknown[]).includes(value)

export const isImportNotice = oneOf(IMPORT_NOTICES)
export const isImportRefusal = oneOf(IMPORT_REFUSALS)
export const isQueueNotice = oneOf(QUEUE_NOTICES)
export const isQueueRefusal = oneOf(QUEUE_REFUSALS)

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
