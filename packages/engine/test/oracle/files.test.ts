// The files a command writes outside filmes-dados (`files` of an adapter):
// a listed folder stands for every file under it on either side, for a
// command that names its file by the date (`avaliar`).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vite-plus/test'
import { ABSENT } from '../../oracle/compare.ts'
import { compareTrees } from '../../oracle/state.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})

const tree = (files: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), 'oracle-files-'))
  roots.push(root)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

const same = (text: string) => text
const compare = (python: string, ts: string, only: readonly string[]) =>
  compareTrees(
    python,
    ts,
    'files',
    'parity',
    { mode: 'bytes', python: same, ts: same },
    only,
  )

describe('files of a command', () => {
  test('a folder compares every file under it, on both sides', () => {
    const python = tree({
      'avaliacoes/2026-11-20.md': 'a\nb\n',
      'avaliacoes/old.md': 'x',
    })
    const ts = tree({
      'avaliacoes/2026-11-20.md': 'a\nc\n',
      'avaliacoes/extra.md': 'y',
    })
    expect(compare(python, ts, ['avaliacoes'])).toEqual([
      {
        check: 'parity',
        path: 'files/avaliacoes/2026-11-20.md:2',
        python: 'b',
        ts: 'c',
      },
      {
        check: 'parity',
        path: 'files/avaliacoes/extra.md',
        python: ABSENT,
        ts: 'present',
      },
      {
        check: 'parity',
        path: 'files/avaliacoes/old.md',
        python: 'present',
        ts: ABSENT,
      },
    ])
  })

  test('a file is compared as itself, and nothing on either side is no difference', () => {
    const python = tree({ 'out.csv': 'same' })
    const ts = tree({ 'out.csv': 'same' })
    expect(compare(python, ts, ['out.csv', 'missing'])).toEqual([])
  })
})
