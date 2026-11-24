// Markdown with YAML frontmatter, the format of every filmes-dados file
// (`filmes/dados/markdown.py`). The frontmatter is what sits between the
// opening "---" line and the next "\n---"; the body is the rest, with its
// leading blank lines dropped.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { Effect } from 'effect'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import {
  parseYaml,
  pyTruthy,
  stringifyYaml,
  YamlError,
  type YamlValue,
} from './yaml.ts'

export interface Markdown {
  /** `yaml.safe_load(...) or {}`: a falsy frontmatter is an empty mapping;
   * a list or a scalar stays what it is. */
  readonly frontmatter: YamlValue
  readonly body: string
}

const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

/** Python's `read_text(encoding="utf-8")`: strict UTF-8, the BOM kept, and
 * "\r\n" and "\r" read as "\n". */
const readText = (path: string): string =>
  utf8.decode(readFileSync(path)).replace(/\r\n?/g, '\n')

/** Frontmatter and body of a text, as `markdown.ler` splits them. `path`
 * only names the file in the errors. */
export const parseMarkdown = (
  path: string,
  text: string,
): Effect.Effect<Markdown, EngineError> =>
  Effect.suspend(() => {
    if (!text.startsWith('---\n'))
      return Effect.succeed({ frontmatter: new Map(), body: text })
    const end = text.indexOf('\n---', 4)
    if (end === -1)
      return Effect.fail(
        engineError(
          'invalid_data',
          `${path}: frontmatter sem o '---' de fechamento`,
        ),
      )
    let frontmatter: YamlValue
    try {
      frontmatter = parseYaml(text.slice(4, end))
    } catch (error) {
      if (!(error instanceof YamlError)) throw error
      return Effect.fail(
        engineError(
          'invalid_data',
          `${path}: frontmatter inválido: ${error.message}`,
        ),
      )
    }
    return Effect.succeed({
      frontmatter: pyTruthy(frontmatter) ? frontmatter : new Map(),
      body: text.slice(end + 4).replace(/^\n+/, ''),
    })
  })

/** `markdown.ler`: the file's frontmatter and body. */
export const readMarkdown = (
  path: string,
): Effect.Effect<Markdown, EngineError> =>
  Effect.flatMap(
    Effect.sync(() => readText(path)),
    (text) => parseMarkdown(path, text),
  )

/** The text `markdown.escrever` writes. */
export const formatMarkdown = (frontmatter: YamlValue, body = ''): string =>
  `---\n${stringifyYaml(frontmatter)}---\n${body}`

/** `markdown.escrever`: writes the file, creating its folder. */
export const writeMarkdown = (
  path: string,
  frontmatter: YamlValue,
  body = '',
): Effect.Effect<void> =>
  Effect.sync(() => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, formatMarkdown(frontmatter, body), 'utf8')
  })
