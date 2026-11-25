// The Python engine left the repository (#108, ADR 0004). This keeps it out:
// no Python or uv file, nothing that runs Python or uv, and no mention of
// either in what builds the image or runs CI. History stays: `docs/` (ADRs,
// dated reports) and the comments that name the Python rule the engine
// follows are not checked.

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'

const ROOT = resolve(import.meta.dirname, '..')

const tracked = (): string[] =>
  spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
    .stdout.split('\0')
    .filter(Boolean)

/** Files that only exist for Python or uv. */
const PYTHON_FILE =
  /\.py$|(^|\/)(pyproject\.toml|uv\.lock|\.python-version|Makefile|requirements[^/]*\.txt)$/

/** A command line that runs Python or uv. Split so this file does not match
 * itself. */
const RUNS_PYTHON = new RegExp(
  [
    String.raw`\bu` + String.raw`v (run|sync|pip|tool|add)\b`,
    'setup-' + 'uv',
    String.raw`\bpy` + String.raw`thon3? (-m|\S+\.py)\b`,
    String.raw`\bpy` + 'test\b',
    String.raw`\bmake ` + 'check\b',
  ].join('|'),
)

/** What builds the image and runs CI, where neither may even be named. */
const BUILD =
  /^\.github\/|(^|\/)(Dockerfile|package\.json|pnpm-workspace\.yaml)$|\.sh$/
const NAMES = new RegExp(
  String.raw`py` + 'thon|' + String.raw`\bu` + String.raw`v\b`,
  'i',
)

/** History and data recorded from the Python engine, read as they are. */
const HISTORY =
  /^docs\/|^packages\/key-migration\/test\/python-outputs\.jsonl$|\.(gz|png|jpg|ico|woff2?)$/

describe('the repository without Python', () => {
  const files = tracked()

  it('has no Python or uv file', () => {
    expect(files.filter((file) => PYTHON_FILE.test(file))).toEqual([])
  })

  it('runs no Python or uv, and the build and CI do not name them', () => {
    const found = files
      .filter((file) => !HISTORY.test(file))
      .flatMap((file) => {
        const text = readFileSync(join(ROOT, file), 'utf8')
        const pattern = BUILD.test(file) ? NAMES : RUNS_PYTHON
        return text
          .split('\n')
          .flatMap((line, i) =>
            pattern.test(line) ? [`${file}:${i + 1}: ${line.trim()}`] : [],
          )
      })
    expect(found).toEqual([])
  })
})
