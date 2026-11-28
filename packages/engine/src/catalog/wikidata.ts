// The Wikidata side of the Catalog (`catalogo/wikidata.py`): which
// properties become edges and age ratings, the dump groups of the
// manifest, and the SPARQL JSON results read as a stream (Python's
// `ijson`), since the ids dump inflates to almost 300 MB.

import { pythonError } from '../compat/python-error.ts'
import { gzipBytes, utf8Text } from './text-source.ts'

/** Wikidata property → edge predicate. */
export const EDGES: ReadonlyMap<string, string> = new Map([
  ['P57', 'diretor'],
  ['P161', 'elenco'],
  ['P136', 'genero'],
  ['P495', 'pais'],
  ['P364', 'idioma'],
  ['P921', 'tema'],
  ['P144', 'baseado_em'],
  ['P179', 'serie'],
  ['P58', 'roteiro'],
  ['P86', 'musica'],
  ['P344', 'fotografia'],
  ['P162', 'produtor'],
  ['P272', 'estudio'],
  ['P840', 'local_da_narrativa'],
  ['P166', 'premio'],
  ['P1411', 'indicacao'],
  ['P750', 'distribuidora'],
  ['P915', 'montagem'],
])

/** The Criterion Collection (#411), the target of the `colecao` edge. */
const CRITERION = 'Q1204187'

/** Wikidata property with a literal value (an id, a spine number) → the
 * edge it becomes: a film with any of them is on the list (#411). */
export const LIST_EDGES: ReadonlyMap<string, readonly [string, string]> =
  new Map([
    ['P9584', ['colecao', CRITERION]],
    ['P12279', ['colecao', CRITERION]],
  ])

/** The age-rating properties (Python's `CLASSIFICACOES`). */
export const RATING_PROPERTIES: ReadonlySet<string> = new Set([
  'P2758',
  'P1981',
  'P2684',
  'P5970',
  'P2756',
  'P1657',
  'P2747',
  'P3306',
  'P2363',
  'P3216',
  'P2637',
  'P2629',
  'P3156',
  'P3402',
  'P3834',
  'P7573',
  'P5150',
  'P3650',
  'P6658',
  'P5201',
  'P3818',
  'P3428',
  'P4437',
  'P8889',
  'P9086',
  'P7327',
  'P8874',
  'P5152',
  'P6452',
  'P10994',
  'P11611',
])

/** The manifest's Wikidata dump groups and their properties, in Python's
 * order (a group is one dump, or one dump per property). */
export const GROUPS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['ids', ['P345', 'P4947', 'P6127', 'P4983', 'P577']],
  ['elenco', ['P161']],
  [
    'conteudo',
    [...[...EDGES.keys()].filter((p) => p !== 'P161'), ...RATING_PROPERTIES],
  ],
  ['atores', ['P345']],
  ['series', ['P31']],
  ['subgeneros', ['P279']],
  ['colecao', [...LIST_EDGES.keys()]],
]

/** Groups a manifest from before #35 (atores), #48 (subgeneros), #49
 * (series) or #411 (colecao) does not have. */
export const OPTIONAL_GROUPS: ReadonlySet<string> = new Set([
  'atores',
  'series',
  'subgeneros',
  'colecao',
])

/** A SPARQL term: `{ type, value, ... }`. */
export interface Term {
  readonly type?: string
  readonly value: string
  readonly [key: string]: unknown
}

/** One result row: variable → term. */
export type Binding = Readonly<Record<string, Term | undefined>>

const IRI = [
  'http://www.wikidata.org/entity/',
  'https://www.wikidata.org/entity/',
]

/** The QID of a term that is a Wikidata item IRI, or `undefined`. */
export const qid = (term: Term | undefined): string | undefined => {
  if (term === undefined || term.type !== 'uri') return undefined
  const value = term.value
  if (!IRI.some((prefix) => value.startsWith(prefix))) return undefined
  const item = value.slice(value.lastIndexOf('/') + 1)
  return /^Q[0-9]+$/.test(item) ? item : undefined
}

/** The last segment of a term's IRI (Python's `_id`). */
export const lastSegment = (term: Term | undefined): string => {
  if (term === undefined) throw pythonError('KeyError', "'value'")
  return term.value.slice(term.value.lastIndexOf('/') + 1)
}

const OPEN_BRACE = 123
const CLOSE_BRACE = 125
const OPEN_BRACKET = 91
const CLOSE_BRACKET = 93
const QUOTE = 34
const BACKSLASH = 92
const COLON = 58
const COMMA = 44

const incomplete = () =>
  pythonError('ValueError', 'resultado SPARQL ausente ou incompleto')

/** Scans a SPARQL JSON result fed in chunks. Each object of
 * `results.bindings` is cut out by its braces and parsed on its own; the
 * envelope (`results.bindings` and QLever's `meta.result-size-total`) is
 * followed by the keys of the first two levels. */
class SparqlScanner {
  /** The containers open: `{` or `[`, with the key each sits under. */
  private readonly stack: Array<{ kind: number; key: string | undefined }> = []
  private buffer = ''
  private at = 0
  private inString = false
  private escaped = false
  private stringStart = -1
  private lastKey: string | undefined
  private itemStart = -1
  private numberStart = -1
  bindings = false
  count = 0
  expected: number | undefined

  private path(): string {
    return this.stack
      .slice(1)
      .map((frame) => frame.key ?? '')
      .join('.')
  }

  /** Drops the text behind every token still open, and appends `text`. */
  private refill(text: string): void {
    const keep =
      this.itemStart >= 0
        ? this.itemStart
        : this.stringStart >= 0
          ? this.stringStart
          : this.numberStart >= 0
            ? this.numberStart
            : this.at
    this.buffer = this.buffer.slice(keep) + text
    this.at -= keep
    if (this.itemStart >= 0) this.itemStart -= keep
    if (this.stringStart >= 0) this.stringStart -= keep
    if (this.numberStart >= 0) this.numberStart -= keep
  }

  /** A character inside a string; at its end, a kept string is the key. */
  private stringChar(c: number): void {
    if (this.escaped) this.escaped = false
    else if (c === BACKSLASH) this.escaped = true
    else if (c === QUOTE) {
      this.inString = false
      if (this.stringStart >= 0) {
        this.lastKey = JSON.parse(
          this.buffer.slice(this.stringStart, this.at + 1),
        ) as string
        this.stringStart = -1
      }
    }
  }

  /** A number of the first two levels ends: keep QLever's count. */
  private endNumber(): void {
    if (this.numberStart >= 0 && !/[0-9eE+\-.]/.test(this.buffer[this.at]!)) {
      if (this.path() === 'meta' && this.lastKey === 'result-size-total')
        this.expected = Number(this.buffer.slice(this.numberStart, this.at))
      this.numberStart = -1
    }
  }

  private openContainer(c: number, depth: number): void {
    const inBindings =
      c === OPEN_BRACE &&
      depth === 3 &&
      this.stack[2]!.kind === OPEN_BRACKET &&
      this.path() === 'results.bindings'
    if (inBindings) this.itemStart = this.at
    if (
      c === OPEN_BRACKET &&
      depth === 2 &&
      this.path() === 'results' &&
      this.lastKey === 'bindings'
    )
      this.bindings = true
    this.stack.push({
      kind: c,
      key: depth === 0 ? undefined : this.lastKey,
    })
    this.lastKey = undefined
  }

  private closeContainer(out: Binding[]): void {
    this.stack.pop()
    if (this.itemStart >= 0 && this.stack.length === 3) {
      out.push(
        JSON.parse(this.buffer.slice(this.itemStart, this.at + 1)) as Binding,
      )
      this.count += 1
      this.itemStart = -1
    }
    this.lastKey = this.stack.length > 0 ? this.stack.at(-1)!.key : undefined
  }

  push(text: string): Binding[] {
    this.refill(text)
    const out: Binding[] = []
    const buffer = this.buffer
    for (; this.at < buffer.length; this.at++) {
      const c = buffer.charCodeAt(this.at)
      if (this.inString) {
        this.stringChar(c)
        continue
      }
      this.endNumber()
      const depth = this.stack.length
      if (c === QUOTE) {
        this.inString = true
        // Keys and values of the first two levels are short: keep them.
        if (depth <= 2 && this.itemStart < 0) this.stringStart = this.at
      } else if (c === OPEN_BRACE || c === OPEN_BRACKET)
        this.openContainer(c, depth)
      else if (c === CLOSE_BRACE || c === CLOSE_BRACKET)
        this.closeContainer(out)
      else if (c === COMMA || c === COLON) {
        if (c === COMMA && this.stack.at(-1)?.kind === OPEN_BRACE)
          this.lastKey = undefined
      } else if (
        depth <= 2 &&
        this.itemStart < 0 &&
        this.numberStart < 0 &&
        /[0-9-]/.test(buffer[this.at]!)
      )
        this.numberStart = this.at
    }
    return out
  }

  end(): void {
    if (this.numberStart >= 0) {
      this.push(' ')
    }
    if (this.inString || this.stack.length > 0) throw incomplete()
  }
}

/** `resposta`: the rows of a SPARQL JSON result read from `bytes`, a batch
 * per chunk. A result with no `results.bindings`, cut short, or with fewer
 * rows than QLever's `meta.result-size-total` throws Python's
 * `ValueError`. */
export async function* sparqlBindings(
  bytes: AsyncIterable<Buffer>,
): AsyncGenerator<Binding[]> {
  const scanner = new SparqlScanner()
  for await (const text of utf8Text(bytes)) {
    const rows = scanner.push(text)
    if (rows.length > 0) yield rows
  }
  scanner.end()
  if (
    !scanner.bindings ||
    (scanner.expected !== undefined && scanner.expected !== scanner.count)
  )
    throw incomplete()
}

/** `linhas`: the rows of a gzipped SPARQL JSON result, a batch per chunk. */
export const sparqlRows = (path: string): AsyncGenerator<Binding[]> =>
  sparqlBindings(gzipBytes(path))

/** Where `atualizar` asks first, and the per-property fallback. */
export const QLEVER = 'https://qlever.dev/api/wikidata'
export const WDQS = 'https://query.wikidata.org/sparql'

const PREFIXES = `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>`

/** P179 also points at lists and rankings: a series is an item with P31
 * under one of these classes (film series, media franchise). Only a film
 * series counts for the Série na ordem (#165), so the series dump says
 * which of the two each class falls under (`?raiz`). */
export const FILM_SERIES = 'Q24856'
export const MEDIA_FRANCHISE = 'Q196600'
const SERIES = [FILM_SERIES, MEDIA_FRANCHISE]

const SCOPES: Readonly<Record<string, string>> = {
  ids: '{ ?item wdt:P31 wd:Q11424 } UNION { ?item wdt:P6127 ?slug }',
  atores: '?filme wdt:P31 wd:Q11424 ; wdt:P161 ?item .',
  series:
    '?filme wdt:P31 wd:Q11424 ; wdt:P179 ?item .\n' +
    `    ?valor wdt:P279* ?raiz . VALUES ?raiz { ${SERIES.map((q) => `wd:${q}`).join(' ')} }`,
  // The films' genres and every class above them, so the hierarchy stays
  // whole even where no film uses an intermediate genre.
  subgeneros:
    '{ SELECT DISTINCT ?item WHERE { ?filme wdt:P31 wd:Q11424 ; wdt:P136/wdt:P279* ?item . } }',
}

/** The variables a group's scope binds besides `?item ?p ?valor`. */
const EXTRA_VARIABLES: Readonly<Record<string, string>> = {
  series: ' ?raiz',
}

/** `consulta`: the SPARQL query of a group, for some of its properties. */
export const groupQuery = (
  group: string,
  properties: readonly string[],
): string => `${PREFIXES}
SELECT DISTINCT ?item ?p ?valor${EXTRA_VARIABLES[group] ?? ''} WHERE {
    ${SCOPES[group] ?? '?item wdt:P31 wd:Q11424 .'}
    VALUES ?p { ${properties.map((p) => `wdt:${p}`).join(' ')} }
    ?item ?p ?valor .
}`

/** `consulta_rotulos`: the labels and language codes of some items. */
export const labelsQuery = (items: readonly string[]): string => `${PREFIXES}
SELECT ?valor ?pt ?en ?mul ?codigo WHERE {
    VALUES ?valor { ${items.map((item) => `wd:${item}`).join(' ')} }
    OPTIONAL { ?valor rdfs:label ?pt FILTER(LANG(?pt) = "pt") }
    OPTIONAL { ?valor rdfs:label ?en FILTER(LANG(?en) = "en") }
    OPTIONAL { ?valor rdfs:label ?mul FILTER(LANG(?mul) = "mul") }
    OPTIONAL { ?valor wdt:P218 ?codigo }
}`
