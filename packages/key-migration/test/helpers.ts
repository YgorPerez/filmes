import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

export const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
export const FIXTURE_DATA = join(ROOT, 'tests/fixture/dados')
export const CONFIG = join(ROOT, 'config')
export const CORPUS = fileURLToPath(new URL('./corpus', import.meta.url))

export type Kind = 'person' | 'session' | 'letterboxd'

/** The corpus: frontmatter files the Python engine wrote during its test
 * suite, picked to cover every key and closed-list value it writes. */
export function corpus(kind: Kind): Array<{ name: string; text: string }> {
  const dir = join(CORPUS, kind)
  return readdirSync(dir)
    .sort()
    .map((name) => ({ name, text: readFileSync(join(dir, name), 'utf8') }))
}

export function frontmatter(text: string): unknown {
  return parse(text.slice(4, text.indexOf('\n---', 4)), { version: '1.1' })
}

export function scratch(): string {
  return mkdtempSync(join(tmpdir(), 'key-migration-test-'))
}

export function writeTree(root: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
}

export function readTree(root: string): Record<string, string> {
  const out: Record<string, string> = {}
  const visit = (dir: string, prefix: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) visit(join(dir, e.name), `${prefix}${e.name}/`)
      else out[`${prefix}${e.name}`] = readFileSync(join(dir, e.name), 'utf8')
    }
  }
  visit(root, '')
  return out
}
