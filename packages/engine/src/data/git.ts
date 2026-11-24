// `git` as a child process, for `DataWriter`. Every call runs in one
// repository (filmes-dados), with hooks off, the messages in English and no
// prompt, and none of the caller's `GIT_*` variables: a `GIT_DIR` or a
// `GIT_INDEX_FILE` leaking from a hook that runs the tests would point git
// at another repository.

import { spawn } from 'node:child_process'
import { Effect, Schema } from 'effect'

/** git refused, or could not run. At an edge it is `internal`. */
export class GitError extends Schema.TaggedError<
  GitError,
  { readonly brand: unique symbol }
>()('GitError', { message: Schema.String }) {}

export interface GitResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

/** The last lines of what git said, for a message. */
const tail = (text: string): string =>
  text.trim().split('\n').slice(-5).join('\n')

/** The environment of a git call: the process's, without `GIT_*`, plus
 * `extra`. */
const gitEnv = (
  extra: Readonly<Record<string, string>>,
): Record<string, string | undefined> => {
  const env: Record<string, string | undefined> = {}
  for (const [name, value] of Object.entries(process.env))
    if (!name.startsWith('GIT_')) env[name] = value
  return {
    ...env,
    LC_ALL: 'C',
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_NOSYSTEM: '1',
    ...extra,
  }
}

/** One git call in `cwd`, whatever its exit code. Interrupting the fiber
 * kills git. */
export const runGit = (
  cwd: string,
  args: readonly string[],
  extra: Readonly<Record<string, string>> = {},
): Effect.Effect<GitResult, GitError> =>
  Effect.tryPromise({
    try: (signal) =>
      new Promise<GitResult>((resolve, reject) => {
        const child = spawn(
          'git',
          [
            '-c',
            'core.hooksPath=/dev/null',
            '-c',
            'commit.gpgSign=false',
            ...args,
          ],
          {
            cwd,
            env: gitEnv(extra),
            signal,
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        )
        let stdout = ''
        let stderr = ''
        child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
          stdout += chunk
        })
        child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
          stderr += chunk
        })
        child.on('error', reject)
        child.on('close', (code) =>
          resolve({ code: code ?? -1, stdout, stderr }),
        )
      }),
    catch: (cause) =>
      new GitError({
        message: `git ${args[0] ?? ''}: ${cause instanceof Error ? cause.message : String(cause)}`,
      }),
  })

/** One git call that must exit with 0; its stdout. */
export const git = (
  cwd: string,
  args: readonly string[],
  extra: Readonly<Record<string, string>> = {},
): Effect.Effect<string, GitError> =>
  Effect.flatMap(runGit(cwd, args, extra), (result) =>
    result.code === 0
      ? Effect.succeed(result.stdout)
      : Effect.fail(
          new GitError({
            message: `git ${args[0] ?? ''} exited with ${result.code}: ${tail(result.stderr || result.stdout)}`,
          }),
        ),
  )
