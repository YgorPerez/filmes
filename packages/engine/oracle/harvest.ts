// The fixture scenarios, harvested from pytest (#76 §4.2): the suite runs
// with `FILMES_ORACLE_TRACE` on, one process per test file in parallel, and
// the trace hook in `tests/conftest.py` writes each test's CLI steps. The
// result is cached by the hash of everything that could change it.

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, relative } from 'node:path'
import { CACHE, ROOT } from './paths.ts'
import { cleanEnv } from './python.ts'
import { readScenarios, type Scenario } from './scenario.ts'

/** What the trace depends on, from the repo root. */
const INPUTS = ['tests', 'filmes', 'config', 'pyproject.toml', 'uv.lock']

/** Not inputs: bytecode, and the machine's `config/local.toml`. */
const SKIPPED = new Set(['__pycache__', 'local.toml', '.pytest_cache'])

function files(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path]
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => !SKIPPED.has(entry.name))
    .map((entry) => entry.name)
    .sort()
    .flatMap((name) => files(join(path, name)))
}

function inputsHash(): string {
  const hash = createHash('sha256')
  for (const input of INPUTS)
    for (const file of files(join(ROOT, input))) {
      hash.update(relative(ROOT, file))
      hash.update('\0')
      hash.update(readFileSync(file))
      hash.update('\0')
    }
  return hash.digest('hex').slice(0, 16)
}

/** Runs `tasks` with at most `jobs` at a time, results in order. */
export async function pool<T, R>(
  items: readonly T[],
  jobs: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length })
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await task(items[i] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, jobs) }, worker))
  return results
}

function pytest(python: string, file: string, trace: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const env = { ...cleanEnv(), FILMES_ORACLE_TRACE: trace }
    const child = spawn(
      python,
      ['-m', 'pytest', '-q', '-p', 'no:cacheprovider', file],
      { cwd: ROOT, env },
    )
    const output: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => output.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => output.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      // 5: no test collected.
      if (code === 0 || code === 5) resolve()
      else
        reject(
          new Error(
            `pytest ${file} failed (exit ${code}): the Python suite must be green before the oracle runs\n${Buffer.concat(output).toString('utf8').slice(-4000)}`,
          ),
        )
    })
  })
}

export interface HarvestOptions {
  readonly python: string
  readonly jobs: number
  /** Only these test files (from the repo root), not cached. */
  readonly testFiles?: readonly string[]
}

/** The scenarios of the pytest suite (or of `testFiles`). */
export async function harvest(options: HarvestOptions): Promise<Scenario[]> {
  const cached = join(CACHE, `${inputsHash()}.jsonl`)
  if (!options.testFiles && existsSync(cached)) return readScenarios(cached)

  const testFiles =
    options.testFiles ??
    readdirSync(join(ROOT, 'tests'))
      .filter((file) => /^test_.*\.py$/.test(file))
      .sort()
      .map((file) => `tests/${file}`)
  mkdirSync(CACHE, { recursive: true })
  const work = mkdtempSync(join(CACHE, '.harvest-'))
  try {
    await pool(testFiles, options.jobs, (file) =>
      pytest(
        options.python,
        file,
        join(work, `${file.replaceAll('/', '_')}.jsonl`),
      ),
    )
    const lines = readdirSync(work)
      .sort()
      .map((file) => readFileSync(join(work, file), 'utf8'))
      .join('')
    const trace = join(work, 'trace.jsonl')
    writeFileSync(trace, lines)
    const scenarios = readScenarios(trace)
    if (!options.testFiles) {
      for (const old of readdirSync(CACHE))
        if (old.endsWith('.jsonl')) rmSync(join(CACHE, old), { force: true })
      renameSync(trace, cached)
    }
    return scenarios
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
