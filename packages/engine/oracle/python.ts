// The Python side of a step: `python -m filmes <argv> --json`, as the pytest
// seam runs it, with a fixed hash seed.

import { spawn, spawnSync } from 'node:child_process'
import type { Outcome } from './compare.ts'
import { ROOT } from './paths.ts'

/** The interpreter of the repo's virtualenv (`uv run python`), resolved
 * once: `uv run` per step would double the run time. */
export function resolvePython(): string {
  const result = spawnSync(
    'uv',
    ['run', 'python', '-c', 'import sys; print(sys.executable)'],
    { cwd: ROOT, encoding: 'utf8' },
  )
  if (result.status !== 0)
    throw new Error(
      `could not find the Python engine (is uv installed?):\n${result.error?.message ?? ''}${result.stderr}`,
    )
  return result.stdout.trim()
}

/** The parent's environment without any `FILMES_*`, as the pytest seam
 * starts from. */
export function cleanEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.startsWith('FILMES_') && key !== 'PYTHONHASHSEED',
    ),
  )
}

/** The environment of a Python run: `cleanEnv()` plus `vars`, with the hash
 * seed fixed. */
export function pythonEnv(
  vars: Readonly<Record<string, string>>,
  seed: number,
): NodeJS.ProcessEnv {
  return { ...cleanEnv(), ...vars, PYTHONHASHSEED: String(seed) }
}

/** Runs one CLI call. The output is stdout, or stderr when stdout is empty,
 * parsed as JSON (as `tests/conftest.py` reads it). */
export function runPython(
  python: string,
  argv: readonly string[],
  stdin: string | null,
  env: NodeJS.ProcessEnv,
): Promise<Outcome> {
  return new Promise((resolve, reject) => {
    const child = spawn(python, ['-m', 'filmes', ...argv, '--json'], {
      cwd: ROOT,
      env,
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      const out = Buffer.concat(stdout).toString('utf8')
      const err = Buffer.concat(stderr).toString('utf8')
      const text = out.trim() ? out : err
      try {
        resolve({ exitCode: code ?? -1, output: JSON.parse(text) as unknown })
      } catch {
        reject(
          new Error(
            `python -m filmes ${argv.join(' ')}: output is not JSON (exit ${code}):\n${out}\n${err}`,
          ),
        )
      }
    })
    child.stdin.end(stdin ?? '')
  })
}
