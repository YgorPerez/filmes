// Reads a parsed Python CLI output in English, with the tables of
// `tables/output.ts`: what the parity oracle (ADR 0004) compares with the
// TypeScript engine's result.

import { MigrationError } from './rewrite-yaml.ts'
import { invert, type Shape } from './shape.ts'
import { COMMANDS, error } from './tables/output.ts'

/** `value` with every key and closed-list value renamed by `shape`. A key or
 * value outside the table is an error, so a new field cannot slip through
 * unnamed. */
export function renameValue(value: unknown, shape: Shape, path = '$'): unknown {
  if (value === null || value === undefined) return value
  if (Array.isArray(value)) {
    const items = shape.items
    if (!items)
      throw new MigrationError(`${path}: a list where none was expected`)
    return value.map((item, i) => renameValue(item, items, `${path}[${i}]`))
  }
  // A plain object is a map; a Date (YAML 1.1 reads `2026-11-20` as one) is
  // a single value.
  if (typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {}
    if (!shape.fields && !shape.entries)
      throw new MigrationError(`${path}: a map where none was expected`)
    for (const [key, inner] of Object.entries(value)) {
      const field = shape.fields?.[key]
      if (field)
        out[field.name] = renameValue(inner, field.shape, `${path}.${key}`)
      else if (shape.entries)
        out[key] = renameValue(inner, shape.entries, `${path}.${key}`)
      else throw new MigrationError(`${path}: unknown key '${key}'`)
    }
    return out
  }
  const scalar = shape.scalar
  if (scalar === 'free') return value
  if (!scalar)
    throw new MigrationError(`${path}: a single value where none was expected`)
  const to = typeof value === 'string' ? scalar.values[value] : undefined
  if (to !== undefined) return to
  if (scalar.open) return value
  throw new MigrationError(`${path}: unknown value ${JSON.stringify(value)}`)
}

/** A Python command's JSON output (`python -m filmes <command> --json`), in
 * English. `command` is the Python name, with the subcommand after a space
 * (`pessoa ver`, `fila confirmar`, `cartaz responder`). An error output reads
 * the same for every command. */
export function outputToEnglish(command: string, output: unknown): unknown {
  if (output !== null && typeof output === 'object' && 'erro' in output)
    return renameValue(output, error)
  const known = COMMANDS[command]
  if (!known) throw new MigrationError(`no output table for '${command}'`)
  return renameValue(output, known.shape)
}

/** The other way: an English result named as the Python CLI names it. */
export function outputToPortuguese(command: string, output: unknown): unknown {
  if (output !== null && typeof output === 'object' && 'error' in output)
    return renameValue(output, invert(error))
  const known = COMMANDS[command]
  if (!known) throw new MigrationError(`no output table for '${command}'`)
  return renameValue(output, invert(known.shape))
}
