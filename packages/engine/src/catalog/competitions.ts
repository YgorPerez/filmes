// The festival competitions dump (#411): the films of the main competition
// of each Cannes, Berlin and Venice edition, read from the edition's
// article on the English Wikipedia (CC BY-SA). `update` builds it; the
// `rebuild` turns each film into an edge `competicao` → the festival.

import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { Effect } from 'effect'
import { pythonError } from '../compat/python-error.ts'
import { qid, type Binding } from './wikidata.ts'

/** The dump's name in the manifest; optional, a manifest from before #411
 * does not have it. */
export const COMPETITIONS = 'wikipedia-competicoes.json.gz'

/** The Fonte of the edges. */
export const WIKIPEDIA = 'Wikipedia'

/** One edition: its festival and edition items, the article and revision
 * read, the heading of the section taken (null without one), and the items
 * its film links lead to. A director or a country that comes along is no
 * film of the Catálogo, and the loading drops it. */
export interface Edition {
  readonly festival: string
  readonly edition: string
  readonly article: string
  readonly revision: number
  readonly section: string | null
  readonly items: ReadonlyArray<string>
}

const QID = /^Q[0-9]+$/

const isEdition = (value: unknown): value is Edition => {
  if (typeof value !== 'object' || value === null) return false
  const edition = value as Record<string, unknown>
  return (
    typeof edition['festival'] === 'string' &&
    QID.test(edition['festival']) &&
    typeof edition['edition'] === 'string' &&
    typeof edition['article'] === 'string' &&
    typeof edition['revision'] === 'number' &&
    (edition['section'] === null || typeof edition['section'] === 'string') &&
    Array.isArray(edition['items']) &&
    edition['items'].every((item) => typeof item === 'string' && QID.test(item))
  )
}

/** The editions of a dump's JSON text; a dump of another shape throws
 * Python's `ValueError`. */
export const parseCompetitions = (text: string): ReadonlyArray<Edition> => {
  const parsed: unknown = JSON.parse(text)
  const editions =
    typeof parsed === 'object' && parsed !== null && 'editions' in parsed
      ? parsed.editions
      : undefined
  if (!Array.isArray(editions) || !editions.every(isEdition))
    throw pythonError('ValueError', `${COMPETITIONS} fora do formato`)
  return editions
}

/** The editions of the gzipped dump at `path`. */
export const readCompetitions = (path: string): ReadonlyArray<Edition> =>
  parseCompetitions(gunzipSync(readFileSync(path)).toString('utf8'))

// Building the dump, for `update`.

/** Cannes, Berlin and Venice. */
export const FESTIVALS: ReadonlyArray<string> = ['Q42369', 'Q130871', 'Q49024']

/** The festivals' editions with an English Wikipedia article. */
export const EDITIONS_QUERY = `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX schema: <http://schema.org/>
SELECT DISTINCT ?festival ?edition ?article WHERE {
    VALUES ?festival { ${FESTIVALS.map((q) => `wd:${q}`).join(' ')} }
    ?edition wdt:P179 ?festival .
    ?article schema:about ?edition ; schema:isPartOf <https://en.wikipedia.org/> .
}`

export const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php'

/** Titles per API request: the MediaWiki limit for a client without the
 * bot right. */
const BATCH = 50

/** Articles the heading rule gets wrong: `none`, an edition without a
 * competition (Venice from 1969 to 1979 gave no Golden Lion); `lead`, a
 * competition section whose sub-sections are other sections of the
 * festival, so only its text before them counts. */
const OVERRIDES: ReadonlyMap<string, 'none' | 'lead'> = new Map([
  ...['30th', '31st', '32nd', '33rd', '34th', '35th', '36th'].map(
    (n) => [`${n} Venice International Film Festival`, 'none'] as const,
  ),
  ['66th Berlin International Film Festival', 'lead'],
])

const HEADING = /^(={2,6})\s*(.*?)\s*\1\s*$/gm
const JUDGED = /jur|award|prize|winner/i
const SKIP =
  /out of|short|jury|juries|award|prize|cin[ée]fondation|orizzonti|horizons|first feature|debut|classics|un certain/i
const COMPETITION =
  /competition|concorso|venezia \d+|official selection|feature films|films? (in|selected)/i
const LINK = /\[\[([^|\]#]+)(?:#[^|\]]*)?(?:\|[^\]]*)?\]\]/

/** A heading's text without markup: tags, italics, and links as their
 * label. */
const plain = (text: string): string =>
  text
    .replace(
      /<[^>]+>|''+|\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g,
      (_, label: string | undefined) => label ?? '',
    )
    .trim()

interface Heading {
  readonly start: number
  readonly end: number
  readonly level: number
  readonly text: string
}

const headingsOf = (text: string): ReadonlyArray<Heading> =>
  [...text.matchAll(HEADING)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    level: match[1]!.length,
    text: plain(match[2]!),
  }))

interface Section {
  readonly heading: string
  readonly body: string
}

/** The main competition's section: the first heading that names a
 * competition (or an official selection) outside the juries and awards,
 * and not a side section; an official selection with sub-sections narrows
 * to its competition one. `lead` keeps only the text before the first
 * sub-section. */
const competitionSection = (
  text: string,
  lead = false,
): Section | undefined => {
  const headings = headingsOf(text)
  let parent = ''
  for (const [index, heading] of headings.entries()) {
    if (heading.level === 2) parent = heading.text
    if (JUDGED.test(parent) || JUDGED.test(heading.text)) continue
    if (!COMPETITION.test(heading.text) || SKIP.test(heading.text)) continue
    const next = headings.slice(index + 1)
    const end =
      (lead ? next[0] : next.find((h) => h.level <= heading.level))?.start ??
      text.length
    const body = text.slice(heading.end, end)
    if (!lead && headingsOf(body).length > 0) {
      const inner = competitionSection(body)
      if (inner !== undefined)
        return {
          heading: `${heading.text} > ${inner.heading}`,
          body: inner.body,
        }
    }
    return { heading: heading.text, body }
  }
  return undefined
}

const TABLE_ATTRIBUTES = ['style', 'rowspan', 'class']

/** The film links of a section: links in italics, the link of each table
 * row's first cell, and the first link of each bullet. Links to other
 * namespaces fall out. */
const filmLinks = (body: string): ReadonlyArray<string> => {
  const found = new Set<string>()
  for (const match of body.matchAll(/''+\s*\[\[([^|\]#]+)/g))
    found.add(match[1]!.trim())
  for (const match of body.matchAll(/\[\[([^|\]#]+)[^\]]*\]\]\s*''/g))
    found.add(match[1]!.trim())
  for (const row of body.split(/\n\|-/)) {
    const cells = row.split(/\n\||\|\|/).filter((cell) => cell.trim() !== '')
    const first = cells[0]
    if (first === undefined) continue
    const cell = TABLE_ATTRIBUTES.some((a) => first.trimStart().startsWith(a))
      ? (cells[1] ?? '')
      : first
    const link = LINK.exec(cell)
    if (link) found.add(link[1]!.trim())
  }
  for (const line of body.split('\n'))
    if (line.startsWith('*')) {
      const link = LINK.exec(line)
      if (link) found.add(link[1]!.trim())
    }
  return [...found]
    .filter((title) => title !== '' && !title.includes(':'))
    .map((title) => title.charAt(0).toUpperCase() + title.slice(1))
}

/** One answer's `query`, loosely typed. */
interface QueryPart {
  readonly normalized?: ReadonlyArray<{ from: string; to: string }>
  readonly redirects?: ReadonlyArray<{ from: string; to: string }>
  readonly pages?: ReadonlyArray<Record<string, unknown>>
}

/** Every `query` of a request, following `continue`. */
const queryAll = <E>(
  api: (params: Readonly<Record<string, string>>) => Effect.Effect<unknown, E>,
  params: Readonly<Record<string, string>>,
): Effect.Effect<ReadonlyArray<QueryPart>, E> =>
  Effect.gen(function* () {
    const parts: QueryPart[] = []
    let next: Record<string, string> | undefined = {}
    while (next !== undefined) {
      const answer = (yield* api({
        ...params,
        ...next,
        format: 'json',
        formatversion: '2',
      })) as { query?: QueryPart; continue?: Record<string, string> }
      if (answer.query !== undefined) parts.push(answer.query)
      next = answer.continue
    }
    return parts
  })

/** Where each title asked lands: normalized, then redirected. */
const landing = (parts: ReadonlyArray<QueryPart>) => {
  const normalized = new Map<string, string>()
  const redirected = new Map<string, string>()
  for (const part of parts) {
    for (const { from, to } of part.normalized ?? []) normalized.set(from, to)
    for (const { from, to } of part.redirects ?? []) redirected.set(from, to)
  }
  return (title: string) => {
    const name = normalized.get(title) ?? title
    return redirected.get(name) ?? name
  }
}

const batches = <A>(items: ReadonlyArray<A>): A[][] => {
  const out: A[][] = []
  for (let at = 0; at < items.length; at += BATCH)
    out.push(items.slice(at, at + BATCH))
  return out
}

interface Article {
  readonly festival: string
  readonly edition: string
  readonly title: string
}

/** The articles of the editions query's rows, once each, by title. */
const articlesOf = (rows: ReadonlyArray<Binding>): ReadonlyArray<Article> => {
  const byTitle = new Map<string, Article>()
  for (const row of rows) {
    const festival = qid(row['festival'])
    const edition = qid(row['edition'])
    const url = row['article']?.value
    if (festival === undefined || edition === undefined || url === undefined)
      continue
    const title = decodeURIComponent(
      url.slice(url.indexOf('/wiki/') + 6),
    ).replaceAll('_', ' ')
    if (!byTitle.has(title)) byTitle.set(title, { festival, edition, title })
  }
  return [...byTitle.values()].sort((a, b) => compare(a.title, b.title))
}

const compare = (a: string, b: string) => Number(a > b) - Number(a < b)

interface Page {
  readonly revision: number
  readonly text: string
}

/** The wikitext and revision of each article, by the title asked. */
const pagesOf = <E>(
  api: (params: Readonly<Record<string, string>>) => Effect.Effect<unknown, E>,
  titles: ReadonlyArray<string>,
) =>
  Effect.gen(function* () {
    const pages = new Map<string, Page>()
    for (const batch of batches(titles)) {
      const parts = yield* queryAll(api, {
        action: 'query',
        prop: 'revisions',
        rvprop: 'content|ids',
        rvslots: 'main',
        redirects: '1',
        titles: batch.join('|'),
      })
      const byTitle = new Map<string, Page>()
      for (const part of parts)
        for (const page of part.pages ?? []) {
          const revision = (
            page['revisions'] as
              | ReadonlyArray<{
                  revid?: number
                  slots?: { main?: { content?: string } }
                }>
              | undefined
          )?.[0]
          const text = revision?.slots?.main?.content
          if (typeof text === 'string' && typeof revision?.revid === 'number')
            byTitle.set(String(page['title']), {
              revision: revision.revid,
              text,
            })
        }
      const land = landing(parts)
      for (const title of batch) {
        const page = byTitle.get(land(title))
        if (page !== undefined) pages.set(title, page)
      }
    }
    return pages
  })

/** The Wikidata item of each title, through its page's `wikibase_item`. */
const itemsOf = <E>(
  api: (params: Readonly<Record<string, string>>) => Effect.Effect<unknown, E>,
  titles: ReadonlyArray<string>,
) =>
  Effect.gen(function* () {
    const items = new Map<string, string>()
    for (const batch of batches(titles)) {
      const parts = yield* queryAll(api, {
        action: 'query',
        prop: 'pageprops',
        ppprop: 'wikibase_item',
        redirects: '1',
        titles: batch.join('|'),
      })
      const byTitle = new Map<string, string>()
      for (const part of parts)
        for (const page of part.pages ?? []) {
          const item = (page['pageprops'] as { wikibase_item?: unknown })
            ?.wikibase_item
          if (typeof item === 'string' && QID.test(item))
            byTitle.set(String(page['title']), item)
        }
      const land = landing(parts)
      for (const title of batch) {
        const item = byTitle.get(land(title))
        if (item !== undefined) items.set(title, item)
      }
    }
    return items
  })

/** The dump's editions: each article of the editions query read through
 * `api` (the MediaWiki API, its parameters without the format), its
 * competition section taken, and its film links turned into items. An
 * article the API does not return is left out. */
export const buildCompetitions = <E>(
  rows: ReadonlyArray<Binding>,
  api: (params: Readonly<Record<string, string>>) => Effect.Effect<unknown, E>,
): Effect.Effect<ReadonlyArray<Edition>, E> =>
  Effect.gen(function* () {
    const articles = articlesOf(rows)
    const pages = yield* pagesOf(
      api,
      articles.map((article) => article.title),
    )
    const sections = new Map<string, Section | undefined>()
    for (const article of articles) {
      const page = pages.get(article.title)
      if (page === undefined) continue
      const override = OVERRIDES.get(article.title)
      sections.set(
        article.title,
        override === 'none'
          ? undefined
          : competitionSection(page.text, override === 'lead'),
      )
    }
    const linksOf = new Map(
      [...sections].map(([title, section]) => [
        title,
        section === undefined ? [] : filmLinks(section.body),
      ]),
    )
    const items = yield* itemsOf(
      api,
      [...new Set([...linksOf.values()].flat())].sort(compare),
    )
    return articles.flatMap((article): Edition[] => {
      const page = pages.get(article.title)
      if (page === undefined) return []
      const linked = new Set(
        (linksOf.get(article.title) ?? []).flatMap((link) => {
          const item = items.get(link)
          return item === undefined ? [] : [item]
        }),
      )
      return [
        {
          festival: article.festival,
          edition: article.edition,
          article: article.title,
          revision: page.revision,
          section: sections.get(article.title)?.heading ?? null,
          items: [...linked].sort(compare),
        },
      ]
    })
  })
