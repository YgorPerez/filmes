// The error a person can see: a code from a closed list and a PT-BR message.
// It replaces the Python `ErroFilmes(codigo, mensagem)` and comes out at the
// edges as `{"error": {"code", "message"}}` (see `Engine.ts`).
//
// One class with a typed `code`, not one class per code: the codes are the
// contract the edges print (once the Python CLI's), and there are fifty of
// them.

import { Schema } from 'effect'

/** Every code the engine can fail with, in English (ADR 0001). The English
 * names of Python's codes, which a test checks (`test/python-names.ts`): a
 * new code goes in both. */
export const ERROR_CODES = [
  'invalid_usage',
  'invalid_file',
  'missing_file',
  'invalid_data',
  'missing_data',
  'invalid_config',
  'missing_config',
  'invalid_catalog',
  'missing_catalog',
  'missing_database',
  'outdated_database',
  'invalid_versions',
  'missing_versions',
  'update_failed',
  'unknown_person',
  'ambiguous_person',
  'person_exists',
  'owner_exists',
  'unknown_session',
  'closed_session',
  'unknown_target',
  'unknown_film',
  'ambiguous_film',
  'film_without_imdb',
  'source_unavailable',
  'invalid_sql',
  'read_only',
  'missing_rss',
  'item_not_queued',
  'unknown_import',
  'ambiguous_import',
  'internal',
  // What `person remove` cannot find or tell apart, by what it removes.
  'unknown_stated',
  'ambiguous_stated',
  'unknown_report',
  'ambiguous_report',
  'unknown_veto',
  'ambiguous_veto',
  'unknown_seen',
  'ambiguous_seen',
  'unknown_open_question',
  'ambiguous_open_question',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

/** Why, finer than the code, where a screen tells the cases apart: the app
 * reads it, never the PT-BR message. Only creating a Pessoa, giving or taking
 * her access and taking her out have them. */
const ERROR_REASONS = [
  // A Pessoa with that slug exists (`person_exists`).
  'slug_taken',
  // The slug, the name or an alias already finds another Pessoa
  // (`person_exists`).
  'name_taken',
  // The rest are `invalid_usage`.
  'invalid_slug',
  // "dono" finds the Dono.
  'reserved_name',
  'email_required',
  'invalid_email',
  'email_not_owner',
  'email_taken',
  // Giving access to a Pessoa that is a Dono already (`invalid_usage`).
  'already_owner',
  // The logged-in Dono taking her own access away (`invalid_usage`).
  'own_access',
  // Reading a Pessoa's Trakt (#269): no Trakt user by that name
  // (`invalid_usage`), a profile Trakt keeps private (`source_unavailable`),
  // a Pessoa with neither a connection nor a username (`invalid_usage`), a
  // server with no Trakt client id (`source_unavailable`).
  'trakt_user_missing',
  'trakt_private',
  'trakt_not_linked',
  'trakt_off',
  // Taking a Pessoa out (#273, `invalid_usage`): she is a Dono, an import
  // holds her history, or a Session lists her.
  'is_owner',
  'has_imports',
  'in_session',
  // An edit (#330) that would make the item equal to another of her file
  // (`invalid_usage`).
  'duplicate_item',
] as const

export type ErrorReason = (typeof ERROR_REASONS)[number]

export class EngineError extends Schema.TaggedError<
  EngineError,
  { readonly brand: unique symbol }
>()('EngineError', {
  code: Schema.Literals(ERROR_CODES),
  /** PT-BR, shown as is. */
  message: Schema.String,
  reason: Schema.optionalKey(Schema.Literals(ERROR_REASONS)),
}) {}

/** Shorthand for `new EngineError({ code, message, reason })`. */
export const engineError = (
  code: ErrorCode,
  message: string,
  reason?: ErrorReason,
): EngineError =>
  new EngineError(
    reason === undefined ? { code, message } : { code, message, reason },
  )
