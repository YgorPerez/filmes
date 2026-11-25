// The Operações forms (admin only) and what the page says after one:
// `?feito=<notice>` or `?erro=<refusal>`. Client-safe: the page and the
// form route both use it.

import { field, oneOf, within } from './form-fields'

/** What a form did. */
export const OPERATIONS_NOTICES = ['avaliando', 'enviado'] as const
export type OperationsNotice = (typeof OPERATIONS_NOTICES)[number]
export const isOperationsNotice = within(OPERATIONS_NOTICES)

/** Why a form did nothing. */
export const OPERATIONS_REFUSALS = [
  'em-andamento',
  'sem-pasta',
  'pedido',
  'indisponivel',
] as const
export type OperationsRefusal = (typeof OPERATIONS_REFUSALS)[number]
export const isOperationsRefusal = within(OPERATIONS_REFUSALS)

/** A form's request: run `evaluate` (with the weight grid or not), or try
 * the push of filmes-dados now. */
export type OperationsAction =
  | { kind: 'evaluate'; grid: boolean }
  | { kind: 'push' }

/** The form as an action; undefined for a form this page never sends. */
export function parseOperation(form: FormData): OperationsAction | undefined {
  switch (oneOf(['avaliar', 'enviar'], field(form, 'acao'))) {
    case 'avaliar':
      return { kind: 'evaluate', grid: field(form, 'grade') === 'sim' }
    case 'enviar':
      return { kind: 'push' }
    default:
      return undefined
  }
}

/** The SQL a query asks the console for: the text, or undefined when there
 * is none. */
export const consultSql = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined
