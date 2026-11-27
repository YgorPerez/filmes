// The evaluation's report (`packages/engine/src/evaluation/report.ts`) read
// for the page (#276): its `##` sections, each with its tables, lists,
// paragraphs and YAML blocks, so Operações shows them as folds and real
// tables instead of the Markdown as text. Only what the engine writes is
// read: no inline Markdown, no nesting. Code, not a component.

import { OPERATIONS } from './operations.copy'

export type Align = 'left' | 'right' | 'center'

export type ReportBlock =
  | { kind: 'table'; head: string[]; align: Align[]; rows: string[][] }
  | { kind: 'code'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'paragraph'; text: string }

export type ReportSection = { title: string; blocks: ReportBlock[] }

/** A decimal number written by the engine ("80.0", "0.28"), not part of a
 * word, a file name, a hash or a version. */
const DECIMAL = /(?<![\w.])-?\d+\.\d+(?![\w.]\w|\w)/g

/** The engine's words for the measure that decides, as the page says them. */
const PRIORITY: Readonly<Record<string, string>> = {
  offline: 'o teste com Notas reservadas',
  online: 'o Feedback das Sessões',
}

/** The report's prose as the rest of the page writes it: decimals in
 * pt-BR, at most two of them ("80.0%" is "80%", "0.27708" is "0,28"), and
 * the measure that decides in words. The YAML blocks keep the engine's
 * text: they copy back to `config/weights.toml`. */
export const localize = (text: string) =>
  text
    .replace(DECIMAL, (n) =>
      Number(n).toLocaleString('pt-BR', {
        maximumFractionDigits: 2,
        useGrouping: false,
      }),
    )
    .replace(
      /^(Medida que decide: )(offline|online)$/,
      (_, label: string, value: string) => `${label}${PRIORITY[value]}`,
    )

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => localize(cell.trim()))

const alignOf = (cell: string): Align =>
  cell.startsWith(':') && cell.endsWith(':')
    ? 'center'
    : cell.endsWith(':')
      ? 'right'
      : 'left'

/** The blocks of one section's lines. */
function blocksOf(lines: readonly string[]): ReportBlock[] {
  const blocks: ReportBlock[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (line.trim() === '') {
      i += 1
    } else if (line.startsWith('```')) {
      const end = lines.findIndex((l, j) => j > i && l.startsWith('```'))
      const stop = end === -1 ? lines.length : end
      blocks.push({ kind: 'code', text: lines.slice(i + 1, stop).join('\n') })
      i = stop + 1
    } else if (line.startsWith('|')) {
      const table: string[] = []
      while (i < lines.length && lines[i]!.startsWith('|'))
        table.push(lines[i++]!)
      const [head = '', rule = '', ...rows] = table
      blocks.push({
        kind: 'table',
        head: cells(head),
        align: cells(rule).map(alignOf),
        rows: rows.map(cells),
      })
    } else if (line.startsWith('- ')) {
      const items: string[] = []
      while (i < lines.length && lines[i]!.startsWith('- '))
        items.push(localize(lines[i++]!.slice(2)))
      blocks.push({ kind: 'list', items })
    } else {
      const text: string[] = []
      while (
        i < lines.length &&
        lines[i]!.trim() !== '' &&
        !/^(```|\||- )/.test(lines[i]!)
      )
        text.push(lines[i++]!)
      blocks.push({ kind: 'paragraph', text: localize(text.join(' ')) })
    }
  }
  return blocks
}

/** The report's `##` sections, in order; the `#` title line is left out
 * (the page says whose report it is). */
export function parseReport(text: string): ReportSection[] {
  const sections: { title: string; lines: string[] }[] = []
  for (const line of text.split('\n')) {
    if (line.startsWith('## '))
      sections.push({ title: line.slice(3).trim(), lines: [] })
    else if (!line.startsWith('# ')) sections.at(-1)?.lines.push(line)
  }
  return sections.map(({ title, lines }) => ({
    title,
    blocks: blocksOf(lines),
  }))
}

const snakeCase = (name: string) =>
  name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

/** A YAML scalar as TOML: numbers and booleans as they are, text quoted. */
const tomlValue = (value: string) =>
  /^(-?\d+(\.\d+)?|true|false)$/.test(value)
    ? value
    : JSON.stringify(value.replace(/^'(.*)'$/, '$1'))

/** The report's weights (YAML of mappings with camelCased keys) as the
 * `config/weights.toml` they came from, to paste back; null for a shape
 * this does not read (a list). */
export function weightsToml(yaml: string): string | null {
  const path: string[] = []
  const tables = new Map<string, string[]>()
  for (const line of yaml.split('\n')) {
    if (line.trim() === '') continue
    const match = /^( *)([\w.-]+):(?: (.*))?$/.exec(line)
    if (!match) return null
    const [, indent = '', key = '', value] = match
    const depth = indent.length / 2
    path.length = depth
    if (value === undefined) {
      path.push(snakeCase(key))
      continue
    }
    const table = path.join('.')
    const entries = tables.get(table) ?? []
    entries.push(`${snakeCase(key)} = ${tomlValue(value)}`)
    tables.set(table, entries)
  }
  return [...tables]
    .map(([table, entries]) =>
      [...(table ? [`[${table}]`] : []), ...entries].join('\n'),
    )
    .join('\n\n')
}

/** The section of the data versions, whose hashes the page shortens. */
const VERSIONS_SECTION = 'Versões dos dados'

/** A cell with no held-out Nota ("— (0/0)"), or no measure at all. */
const EMPTY_CELL = /^(— \(0\/0\)|—|0)$/

/** The sample whose rows say why they are empty, when the Catálogo lacks
 * its dump. */
const MOVIELENS = 'MovieLens'

/** The warning that the MovieLens dump is missing: the MovieLens rows
 * already give it as their cause. */
const NO_MOVIELENS = /ml-32m/

/** A hash of the data versions, longer than the page needs to tell two
 * apart. */
const LONG_HASH = /\b([0-9a-f]{12})[0-9a-f]{4,}\b/g

/** A satisfaction line of the Online section, which names the Pessoa by
 * her slug. */
const SATISFACTION = /^(Satisfação de )(\S+)(:.*)$/

/** The name of the Pessoa `slug`; the slug itself for anyone else. */
const nameOf = (names: Readonly<Record<string, string>>, slug: string) =>
  Object.hasOwn(names, slug) ? names[slug]! : slug

/** A table row as the page shows it: the Pessoa by her name, and a row
 * with nothing measured in one cell that says why; on a row with numbers,
 * an empty cell says "sem Notas". */
function tidyRow(
  row: string[],
  names: Readonly<Record<string, string>>,
  noMovielens: boolean,
): string[] {
  const [first = '', ...rest] = row
  const name = nameOf(names, first)
  if (rest.length > 0 && rest.every((cell) => EMPTY_CELL.test(cell)))
    return [
      name,
      name === MOVIELENS && noMovielens
        ? OPERATIONS.evaluation.noMovielens
        : OPERATIONS.evaluation.noRatingsRow,
    ]
  return [
    name,
    ...rest.map((cell) =>
      cell === '— (0/0)' ? OPERATIONS.evaluation.noRatingsCell : cell,
    ),
  ]
}

function tidyBlock(
  block: ReportBlock,
  title: string,
  names: Readonly<Record<string, string>>,
  noMovielens: boolean,
): ReportBlock | null {
  switch (block.kind) {
    case 'table':
      return {
        ...block,
        rows: block.rows.map((row) => tidyRow(row, names, noMovielens)),
      }
    case 'list': {
      const items = block.items
        .filter((item) => !(noMovielens && NO_MOVIELENS.test(item)))
        .map((item) =>
          item.replace(
            SATISFACTION,
            (_, lead: string, slug: string, tail: string) =>
              `${lead}${nameOf(names, slug)}${tail}`,
          ),
        )
      return items.length === 0 ? null : { ...block, items }
    }
    case 'code':
      return title === VERSIONS_SECTION
        ? { ...block, text: block.text.replace(LONG_HASH, '$1…') }
        : block
    default:
      return block
  }
}

/** The report's sections as the page shows them (#276): each Pessoa by
 * her name, not her slug; a row with nothing measured in one line that
 * says why (for MovieLens without its dump, the missing dump, which then
 * leaves the warnings); the data versions' hashes shortened, with a line
 * that says the whole ones are in the file. A section left with nothing
 * is dropped. */
export function tidyReport(
  sections: readonly ReportSection[],
  names: Readonly<Record<string, string>>,
): ReportSection[] {
  const noMovielens = sections.some((section) =>
    section.blocks.some(
      (block) =>
        block.kind === 'list' &&
        block.items.some((item) => NO_MOVIELENS.test(item)),
    ),
  )
  return sections.flatMap((section) => {
    const blocks = section.blocks.flatMap((block) => {
      const tidy = tidyBlock(block, section.title, names, noMovielens)
      return tidy === null ? [] : [tidy]
    })
    const shortened =
      section.title === VERSIONS_SECTION &&
      section.blocks.some(
        (block) => block.kind === 'code' && block.text.search(LONG_HASH) >= 0,
      )
    if (shortened)
      blocks.push({
        kind: 'paragraph',
        text: OPERATIONS.evaluation.shortHashes,
      })
    return blocks.length === 0 ? [] : [{ title: section.title, blocks }]
  })
}
