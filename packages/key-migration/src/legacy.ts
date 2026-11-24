// Older shapes the Python engine still reads and rewrites on its own. The
// English side has no aliases (ADR 0002), so they are brought to the current
// Portuguese shape before the rename. A file that had one comes back from
// PT → EN → PT in the current shape, not byte for byte: the round trip
// reports it as normalized.
//
// - A Session's `regra: media-sem-miseria-com-justica` is `{nome: padrao}`
//   (`filmes/sessao/arquivo.py`).
// - A Letterboxd resolution's `motivo` is `razao`
//   (`filmes/importar/decisoes.py`).

import { isMap, isScalar, isSeq, parseDocument, type YAMLMap } from 'yaml'
import { MigrationError } from './rewrite-yaml.ts'

interface Edit {
  readonly start: number
  readonly end: number
  readonly text: string
}

function apply(text: string, edits: readonly Edit[]): string {
  let out = text
  for (const edit of [...edits].sort((a, b) => b.start - a.start))
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  return out
}

function frontmatter(text: string): { start: number; yaml: string } | null {
  if (!text.startsWith('---\n')) return null
  const end = text.indexOf('\n---', 4)
  if (end === -1) return null
  return { start: 4, yaml: text.slice(4, end) }
}

function legacyRule(map: YAMLMap, offset: number, edits: Edit[]): void {
  const pair = map.items.find((p) => isScalar(p.key) && p.key.value === 'regra')
  if (
    pair &&
    isScalar(pair.value) &&
    pair.value.value === 'media-sem-miseria-com-justica' &&
    pair.value.range
  )
    edits.push({
      start: offset + pair.value.range[0],
      end: offset + pair.value.range[1],
      text: '{nome: padrao}',
    })
}

function normalizeSession(text: string): string {
  const fm = frontmatter(text)
  if (!fm) return text
  const doc = parseDocument(fm.yaml, { version: '1.1' })
  const edits: Edit[] = []
  if (isMap(doc.contents)) {
    legacyRule(doc.contents, fm.start, edits)
    const versions = doc.contents.get('versoes', true)
    if (isSeq(versions))
      for (const v of versions.items)
        if (isMap(v)) legacyRule(v, fm.start, edits)
  }
  return apply(text, edits)
}

function normalizeLetterboxd(text: string): string {
  const fm = frontmatter(text)
  if (!fm) return text
  const doc = parseDocument(fm.yaml, { version: '1.1' })
  const edits: Edit[] = []
  const films = isMap(doc.contents) ? doc.contents.get('filmes', true) : null
  if (isSeq(films))
    for (const film of films.items) {
      if (!isMap(film)) continue
      const old = film.items.find(
        (p) => isScalar(p.key) && p.key.value === 'motivo',
      )
      if (!old || !isScalar(old.key) || !old.key.range) continue
      if (film.has('razao'))
        throw new MigrationError(
          `a Letterboxd resolution has both 'motivo' and 'razao'`,
        )
      edits.push({
        start: fm.start + old.key.range[0],
        end: fm.start + old.key.range[1],
        text: 'razao',
      })
    }
  return apply(text, edits)
}

/** A Portuguese file in the current shape, with the older shapes rewritten
 * the way the Python engine reads them. */
export function normalizeLegacy(
  kind: 'person' | 'session' | 'letterboxd',
  text: string,
): string {
  if (kind === 'session') return normalizeSession(text)
  if (kind === 'letterboxd') return normalizeLetterboxd(text)
  return text
}
