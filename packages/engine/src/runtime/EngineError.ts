// The error a person can see: a code from a closed list and a PT-BR message.
// It replaces the Python `ErroFilmes(codigo, mensagem)` and comes out at the
// edges as `{"error": {"code", "message"}}` (see `Engine.ts`).
//
// One class with a typed `code`, not one class per code: the codes are the
// CLI contract the oracle compares, and there are fifty of them.

import { Schema } from 'effect'

/** Every code the engine can fail with, in English (ADR 0001). The same set
 * as the values of `ERROR_CODES` in the key migration's output table, which
 * a test checks: a new code goes in both. */
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

export class EngineError extends Schema.TaggedError<
  EngineError,
  { readonly brand: unique symbol }
>()('EngineError', {
  code: Schema.Literals(ERROR_CODES),
  /** PT-BR, shown as is: the oracle compares it with Python's word for
   * word (except for `invalid_usage`). */
  message: Schema.String,
}) {}

/** Shorthand for `new EngineError({ code, message })`. */
export const engineError = (code: ErrorCode, message: string): EngineError =>
  new EngineError({ code, message })
