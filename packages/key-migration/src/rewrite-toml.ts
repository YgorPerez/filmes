// Renames table headers and keys of a `config/*.toml` file, in place, line by
// line. Comments, values and layout are kept byte for byte: the comments are
// PT-BR prose for whoever tunes the weights, and the round trip has to give
// back the same file.
//
// It reads the TOML this repository writes: `[table]` and `[a.b]` headers,
// `key = value` lines and values that span lines inside `[...]`. Anything
// else (inline tables with keys, arrays of tables, multi-line strings) is an
// error, never a silent skip.

import { MigrationError } from './error.ts'
import { invertValues, type Values } from './shape.ts'

export interface TomlTable {
  /** The table's name in the other language. */
  readonly name: string
  /** Key → key. */
  readonly keys: Values
}

export interface TomlShape {
  /** Table path (`forca.multiplicador`, `''` for keys before any header) →
   * its name and keys. */
  readonly tables: Readonly<Record<string, TomlTable>>
  /** For files whose table names are data (Clima names): every table keeps
   * its name and renames its keys with this. */
  readonly anyTable?: Values
}

const HEADER = /^\[\s*([^[\]]+?)\s*\](\s*(?:#.*)?)$/
const KEY = /^(\s*)([A-Za-z0-9_-]+)(\s*=)(.*)$/
const BARE = /^[A-Za-z0-9_-]+$/

/** How much a value line opens `[`/`{` minus what it closes, outside strings
 * and comments. */
function depthChange(text: string, where: string): number {
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '#') break
    if (c === '"' || c === "'") {
      if (text.startsWith(c.repeat(3), i))
        throw new MigrationError(
          `${where}: multi-line strings are not supported`,
        )
      let j = i + 1
      while (j < text.length && text[j] !== c)
        j += c === '"' && text[j] === '\\' ? 2 : 1
      if (j >= text.length)
        throw new MigrationError(`${where}: unclosed string`)
      i = j
    } else if (c === '[' || c === '{') depth++
    else if (c === ']' || c === '}') depth--
  }
  return depth
}

/** The same shape read the other way. */
export function invertToml(shape: TomlShape): TomlShape {
  const tables: Record<string, TomlTable> = {}
  for (const [path, table] of Object.entries(shape.tables)) {
    if (table.name in tables)
      throw new MigrationError(`two tables become [${table.name}]`)
    tables[table.name] = {
      name: path,
      keys: invertValues(table.keys, `[${path}]`),
    }
  }
  return shape.anyTable
    ? { tables, anyTable: invertValues(shape.anyTable, 'any table') }
    : { tables }
}

/** `text` with every table and key renamed by `shape`. */
export function rewriteToml(text: string, shape: TomlShape): string {
  const fallback = (name: string): TomlTable | undefined => {
    const known = shape.tables[name]
    if (known) return known
    return shape.anyTable ? { name, keys: shape.anyTable } : undefined
  }
  let table = fallback('')
  let path = ''
  let depth = 0
  return text
    .split('\n')
    .map((line, n) => {
      const where = `line ${n + 1}`
      if (depth > 0) {
        depth += depthChange(line, where)
        return line
      }
      if (line.startsWith('[['))
        throw new MigrationError(`${where}: arrays of tables are not supported`)
      const header = HEADER.exec(line)
      if (header) {
        path = header[1]!
        table = fallback(path)
        if (!table)
          throw new MigrationError(`${where}: unknown table [${path}]`)
        if (table.name === path) return line
        return `[${table.name}]${header[2]}`
      }
      const key = KEY.exec(line)
      if (key) {
        const [, indent, name, equals, value] = key as unknown as [
          string,
          string,
          string,
          string,
          string,
        ]
        depth += depthChange(value, where)
        if (/\{\s*[A-Za-z0-9_"'-]+\s*=/.test(value))
          throw new MigrationError(`${where}: inline tables are not supported`)
        if (!table)
          throw new MigrationError(
            `${where}: key '${name}' outside a known table`,
          )
        const to = table.keys[name]
        if (to === undefined)
          throw new MigrationError(
            `${where}: unknown key '${name}' in [${path}]`,
          )
        if (!BARE.test(to))
          throw new MigrationError(`${where}: '${to}' is not a bare key`)
        return `${indent}${to}${equals}${value}`
      }
      const trimmed = line.trim()
      if (trimmed !== '' && !trimmed.startsWith('#'))
        throw new MigrationError(
          `${where}: a line this script does not read: ${trimmed}`,
        )
      return line
    })
    .join('\n')
}
