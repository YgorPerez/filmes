// Renames keys and closed-list values inside YAML (or JSON) text, in place.
// Only the characters of a renamed scalar change: comments, quoting, flow or
// block style, line breaks and key order stay byte for byte, which is what
// makes PT → EN → PT give back the same file.
//
// Frontmatter is read as YAML 1.1, as PyYAML writes and reads it.

import {
  isAlias,
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  Scalar,
  type Node,
} from 'yaml'
import { applyEdits, splitFrontmatter, type Edit } from './edit.ts'
import { MigrationError } from './error.ts'
import type { Shape } from './shape.ts'

/** YAML 1.1 words a plain scalar cannot be without changing type. */
const RESERVED =
  /^(y|n|yes|no|on|off|true|false|null|~|\.nan|\.inf|-\.inf|\.\.\.|---)$/i
const PLAIN = /^[\p{L}_][\p{L}\p{N}_ .-]*$/u

function render(value: string, style: Scalar['type']): string {
  switch (style) {
    case Scalar.QUOTE_DOUBLE:
      return JSON.stringify(value)
    case Scalar.QUOTE_SINGLE:
      return `'${value.replaceAll("'", "''")}'`
    case Scalar.PLAIN:
      if (PLAIN.test(value) && !value.endsWith(' ') && !RESERVED.test(value))
        return value
      return `'${value.replaceAll("'", "''")}'`
    default:
      throw new MigrationError(
        `'${value}' is written in a block style, which this script does not rename`,
      )
  }
}

function rename(node: Scalar, to: string, edits: Edit[]): void {
  const range = node.range
  if (!range) throw new MigrationError(`no source range for '${to}'`)
  edits.push({ start: range[0], end: range[1], text: render(to, node.type) })
}

function walk(node: unknown, shape: Shape, path: string, edits: Edit[]): void {
  if (node === null || node === undefined || isAlias(node)) return
  if (isMap(node)) {
    if (!shape.fields && !shape.entries)
      throw new MigrationError(`${path}: a map where none was expected`)
    for (const pair of node.items) {
      if (!isScalar(pair.key))
        throw new MigrationError(`${path}: a key that is not a single value`)
      const key = String(pair.key.value)
      const field = shape.fields?.[key]
      if (field) {
        if (field.name !== key) rename(pair.key, field.name, edits)
        walk(pair.value, field.shape, `${path}.${key}`, edits)
      } else if (shape.entries)
        walk(pair.value, shape.entries, `${path}.${key}`, edits)
      else throw new MigrationError(`${path}: unknown key '${key}'`)
    }
    return
  }
  if (isSeq(node)) {
    if (!shape.items)
      throw new MigrationError(`${path}: a list where none was expected`)
    node.items.forEach((item, i) =>
      walk(item, shape.items!, `${path}[${i}]`, edits),
    )
    return
  }
  if (isScalar(node)) {
    const scalar = shape.scalar
    if (node.value === null || scalar === 'free') return
    if (!scalar)
      throw new MigrationError(
        `${path}: a single value where none was expected`,
      )
    const value = node.value
    const to = typeof value === 'string' ? scalar.values[value] : undefined
    if (to !== undefined) {
      if (to !== value) rename(node, to, edits)
    } else if (!scalar.open)
      throw new MigrationError(
        `${path}: unknown value ${JSON.stringify(value)}`,
      )
    return
  }
  throw new MigrationError(`${path}: unexpected YAML node`)
}

/** `text` with every key and closed-list value renamed by `shape`. */
export function rewriteYaml(
  text: string,
  shape: Shape,
  version: '1.1' | '1.2' = '1.1',
): string {
  const doc = parseDocument(text, { version, uniqueKeys: true })
  if (doc.errors.length > 0)
    throw new MigrationError(`invalid YAML: ${doc.errors[0]!.message}`)
  const edits: Edit[] = []
  walk(doc.contents as Node | null, shape, '$', edits)
  return applyEdits(text, edits)
}

/** A Markdown file of filmes-dados: the frontmatter is rewritten, the body
 * is kept as written. A file without frontmatter is kept. */
export function rewriteMarkdown(text: string, shape: Shape): string {
  const fm = splitFrontmatter(text)
  if (!fm) return text
  const end = fm.start + fm.yaml.length
  return text.slice(0, fm.start) + rewriteYaml(fm.yaml, shape) + text.slice(end)
}
