// In-place edits of a file's text: each one replaces a source range, so
// everything outside the ranges stays byte for byte.

import { MigrationError } from './error.ts'

export interface Edit {
  readonly start: number
  readonly end: number
  readonly text: string
}

/** `text` with every edit applied, from the last range to the first so the
 * earlier offsets still hold. */
export function applyEdits(text: string, edits: readonly Edit[]): string {
  let out = text
  for (const edit of [...edits].sort((a, b) => b.start - a.start))
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  return out
}

/** The frontmatter of a filmes-dados Markdown file: the YAML between the
 * `---` lines and where it starts in the text, split as the Python engine
 * reads it (`filmes/dados/markdown.py`). `null` when the file has none. */
export function splitFrontmatter(
  text: string,
): { readonly start: number; readonly yaml: string } | null {
  if (!text.startsWith('---\n')) return null
  const end = text.indexOf('\n---', 4)
  if (end === -1)
    throw new MigrationError(`frontmatter without the closing '---'`)
  return { start: 4, yaml: text.slice(4, end) }
}
