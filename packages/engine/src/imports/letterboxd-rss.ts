// Reading a copy of a Pessoa's public Letterboxd RSS (`importar/
// rss_letterboxd.py` `ler`), which is fetched only with her consent
// (licences decision, #12). The fetch and the `--letterboxd-rss` command
// are #100's; the Letterboxd load reads the copies kept in filmes-dados.
//
// Each film entry has:
//
//     letterboxd:filmTitle, letterboxd:filmYear   the export's (Name, Year)
//     letterboxd:watchedDate                      the day she watched it (absent on a review without a diary entry)
//     letterboxd:memberRating                     0,5 to 5, when there is one
//     tmdb:movieId                                the film's TMDB id
//     pubDate                                     when the entry was published
//
// Lists have no `filmTitle` and stay out. So does the review's text: the
// `description` mixes the poster and the text.

import { SaxesParser } from 'saxes'
import { pyEmailDate } from '../compat/email-date.ts'
import { pyIsoDate, pyParseFloat } from '../compat/parse.ts'
import { pyReprStr, pyStrip } from '../compat/text.ts'
import { engineError } from '../runtime/EngineError.ts'
import { RSS_FILE, type LetterboxdRow } from './letterboxd-export.ts'

export const RSS_ORIGIN = 'RSS do Letterboxd'

const LETTERBOXD = 'https://letterboxd.com'
const TMDB = 'https://themoviedb.org'

/** An element as ElementTree keeps it: `text` is what comes before its
 * first child. */
interface Element {
  readonly uri: string
  readonly local: string
  readonly children: Element[]
  text: string
  closedText: boolean
}

const parse = (xml: string): Element => {
  const parser = new SaxesParser({ xmlns: true })
  const stack: Element[] = []
  let root: Element | undefined
  const addText = (text: string) => {
    const current = stack.at(-1)
    if (current !== undefined && !current.closedText) current.text += text
  }
  parser.on('opentag', (tag) => {
    const element: Element = {
      uri: tag.uri,
      local: tag.local,
      children: [],
      text: '',
      closedText: false,
    }
    const parent = stack.at(-1)
    if (parent !== undefined) {
      parent.closedText = true
      parent.children.push(element)
    } else root = element
    stack.push(element)
  })
  parser.on('closetag', () => {
    stack.pop()
  })
  parser.on('text', addText)
  parser.on('cdata', addText)
  parser.on('error', (error) => {
    throw error
  })
  parser.write(xml).close()
  if (root === undefined) throw new Error('no element found')
  return root
}

/** `element.iter(local)`: itself and every descendant, in document order. */
function* iter(element: Element, local: string): Generator<Element> {
  if (element.uri === '' && element.local === local) yield element
  for (const child of element.children) yield* iter(child, local)
}

const find = (element: Element, uri: string, local: string) =>
  element.children.find((c) => c.uri === uri && c.local === local)

const textOf = (item: Element, uri: string, local: string): string =>
  pyStrip(find(item, uri, local)?.text ?? '')

const invalid = (message: string) => engineError('invalid_file', message)

const year = (value: string, where: string): number | null => {
  if (!value) return null
  if (!/^[0-9]{4}$/.test(value))
    throw invalid(`${where}: ano inválido: ${pyReprStr(value)}`)
  return Number(value)
}

const published = (value: string, where: string): string => {
  const day = pyEmailDate(value)
  if (day === null)
    throw invalid(`${where}: data de publicação inválida: ${pyReprStr(value)}`)
  return day
}

const watched = (value: string, where: string): string | null => {
  if (!value) return null
  const iso = pyIsoDate(value)
  if (iso === null)
    throw invalid(`${where}: data do diário inválida: ${pyReprStr(value)}`)
  return iso
}

const rating = (value: string, where: string): number | null => {
  if (!value) return null
  let number: number
  try {
    number = pyParseFloat(value)
  } catch {
    throw invalid(`${where}: nota inválida: ${pyReprStr(value)}`)
  }
  if (!(number >= 0.5 && number <= 5))
    throw invalid(`${where}: nota fora de 0,5 a 5: ${pyReprStr(value)}`)
  return number
}

/** The diary entries and Notas of an RSS copy. `name` is the file's name,
 * for the messages. Throws the `EngineError` Python raised; a malformed XML
 * says the XML parser's own words, not expat's. */
export const readLetterboxdRss = (
  name: string,
  content: Uint8Array,
): LetterboxdRow[] => {
  let root: Element
  try {
    const bytes =
      content[0] === 0xef && content[1] === 0xbb && content[2] === 0xbf
        ? content.subarray(3)
        : content
    root = parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch (error) {
    throw invalid(
      `${name}: o RSS não é XML válido (${error instanceof Error ? error.message : String(error)})`,
    )
  }
  if (
    root.uri !== '' ||
    root.local !== 'rss' ||
    find(root, '', 'channel') === undefined
  )
    throw invalid(`${name}: não parece um RSS do Letterboxd`)
  const rows: LetterboxdRow[] = []
  for (const item of iter(root, 'item')) {
    const film = textOf(item, LETTERBOXD, 'filmTitle')
    if (!film) continue
    const where = `${name}, entrada ${textOf(item, '', 'guid') || film}`
    rows.push({
      file: RSS_FILE,
      origin: RSS_ORIGIN,
      name: film,
      year: year(textOf(item, LETTERBOXD, 'filmYear'), where),
      date: published(textOf(item, '', 'pubDate'), where),
      watchedOn: watched(textOf(item, LETTERBOXD, 'watchedDate'), where),
      rating: rating(textOf(item, LETTERBOXD, 'memberRating'), where),
      review: null,
      tags: [],
      tmdb: textOf(item, TMDB, 'movieId') || null,
    })
  }
  return rows
}
