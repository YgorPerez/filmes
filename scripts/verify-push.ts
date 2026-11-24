// What `.githooks/pre-push` runs, like pesquisa-relacionamentos'
// `verify-push.ts` (its ADR 0020, from the Festival dos Macacos). Git passes the remote in the arguments and, on stdin, one line
// per ref the push updates: `<local ref> <local sha> <remote ref> <remote
// sha>`. Everything here comes from those lines, never from HEAD.
//
// - Deleting a branch passes with nothing. Deleting `master` does not.
// - Every other ref goes through the suppressions audit
//   (`.github/scripts/suppressions.ts`) against the target branch: the remote
//   branch the commit is closest to, `master` or a `spec/*`.
// - And through the tests of only what the push affects (`affected.ts`):
//   Vitest with `--changed` in the affected folders, the MCP tests and the
//   Python suite. On the branch's first push, since the merge-base with the
//   target; on later ones, since what the remote already had. The full suite
//   belongs to the PR's CI.
// - `master` only moves forward.
// - `SKIP_TESTS="<reason>" git push ...` skips the tests, not the audit. The
//   reason goes to `<git-common-dir>/push-skip-tests.log`.
//
// A hook belongs to the client: `git push --no-verify` skips it, and the
// server checks none of this. It catches mistakes, not someone set on getting
// through.
//
// Runs on plain `node`, without `node_modules`.

import { spawnSync } from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { planForDiff } from './affected.ts'
import { envWithoutHookGit } from './git-env.ts'

const MAIN = 'refs/heads/master'
const ZERO = /^0+$/

/** The remote branch the commit is closest to: the one with the fewest
 * commits between the merge-base and it. A ticket branches off a `spec/*`,
 * and a spec off `master`. */
export function chooseTarget(
  candidates: readonly { ref: string; ahead: number }[],
): string | null {
  return [...candidates].sort((a, b) => a.ahead - b.ahead)[0]?.ref ?? null
}

export type Run = (
  command: string[],
  folder: string,
  env?: NodeJS.ProcessEnv,
) => number | null

export function verifyPush({
  root,
  remote,
  input,
  run,
  say,
  env,
}: {
  root: string
  remote: string
  input: string
  run: Run
  say: (text: string) => void
  env: NodeJS.ProcessEnv
}) {
  const git = (...args: string[]) =>
    spawnSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      env: envWithoutHookGit(),
    })
  const line = (...args: string[]) => git(...args).stdout.trim()
  const skipTests = env.SKIP_TESTS?.trim()
  let fetched = false
  let refused = false

  /** Fetches the remote's `master` and `spec/*`, once per push. */
  const fetchTargets = () => {
    if (fetched) return
    fetched = true
    const result = git(
      'fetch',
      '--quiet',
      '--no-tags',
      remote,
      `+refs/heads/master:refs/remotes/${remote}/master`,
      `+refs/heads/spec/*:refs/remotes/${remote}/spec/*`,
    )
    if (result.status !== 0)
      say(`could not fetch from ${remote}: ${result.stderr.trim()}`)
  }

  const targetOf = (sha: string, ref: string) => {
    if (ref === MAIN) return `${remote}/master`
    const own = `${remote}/${ref.replace(/^refs\/heads\//, '')}`
    const candidates = line(
      'for-each-ref',
      '--format=%(refname:short)',
      `refs/remotes/${remote}/master`,
      `refs/remotes/${remote}/spec/`,
    )
      .split('\n')
      .filter((r) => r && r !== own)
      .flatMap((r) => {
        const base = line('merge-base', r, sha)
        if (!base) return []
        return [
          {
            ref: r,
            ahead: Number(line('rev-list', '--count', `${base}..${sha}`)),
          },
        ]
      })
    return chooseTarget(candidates)
  }

  for (const text of input.split(/\r?\n/).filter((l) => l.trim())) {
    const [, sha = '', ref = '', remoteSha = ''] = text.trim().split(/\s+/)
    if (ZERO.test(sha)) {
      if (ref === MAIN) {
        say('deleting master is not allowed.')
        refused = true
      } else say(`${ref}: deleting needs nothing.`)
      continue
    }
    fetchTargets()
    const target = targetOf(sha, ref)
    if (target === null) {
      say(`${ref}: found neither master nor a spec/* on ${remote}; refusing.`)
      refused = true
      continue
    }
    const targetSha = line('rev-parse', target)
    say(`${ref} ← ${sha.slice(0, 7)}: target ${target}`)

    if (
      run(
        [
          'node',
          '.github/scripts/suppressions.ts',
          '--base',
          targetSha,
          '--target',
          sha,
        ],
        root,
      ) !== 0
    ) {
      say(`${ref}: the suppressions audit refused ${sha.slice(0, 7)}.`)
      refused = true
    }

    if (
      ref === MAIN &&
      git('merge-base', '--is-ancestor', targetSha, sha).status !== 0
    ) {
      say(
        `master: the one on ${remote} (${targetSha.slice(0, 7)}) is not an ancestor of ${sha.slice(0, 7)}. master does not accept force.`,
      )
      refused = true
    }

    // Since what the remote already had of this branch, if it is an
    // ancestor; otherwise, since the merge-base with the target.
    const alreadyHad =
      !ZERO.test(remoteSha) &&
      git('merge-base', '--is-ancestor', remoteSha, sha).status === 0
    const base = alreadyHad ? remoteSha : line('merge-base', targetSha, sha)
    const files = line('diff', '--name-only', '--no-renames', base, sha)
      .split('\n')
      .filter(Boolean)
    const plan = planForDiff(files)
    const commands: { command: string[]; folder: string }[] = [
      ...plan.vitest.map((folder) => ({
        command: [
          'pnpm',
          'exec',
          'vp',
          'test',
          'run',
          '--changed',
          base,
          '--passWithNoTests',
        ],
        folder: join(root, folder),
      })),
      ...(plan.python
        ? [{ command: ['uv', 'run', 'pytest', '-q'], folder: root }]
        : []),
      ...(plan.mcp
        ? [
            {
              command: ['pnpm', '--filter', '@filmes/mcp', 'test'],
              folder: root,
            },
          ]
        : []),
    ]
    if (commands.length === 0) {
      say(`${ref}: nothing to test since ${base.slice(0, 7)}.`)
      continue
    }
    if (skipTests !== undefined) {
      if (skipTests === '') {
        say('SKIP_TESTS needs the reason: SKIP_TESTS="<reason>" git push ...')
        refused = true
        continue
      }
      const common = line(
        'rev-parse',
        '--path-format=absolute',
        '--git-common-dir',
      )
      appendFileSync(
        join(common, 'push-skip-tests.log'),
        `${new Date().toISOString()} ${sha} ${skipTests}\n`,
      )
      say(`${ref}: without the tests: ${skipTests}`)
      continue
    }
    say(
      `${ref}: tests since ${base.slice(0, 7)}: ${commands
        .map((c) => c.command.join(' '))
        .join('; ')}` + (plan.full ? ` (everything: ${plan.full})` : ''),
    )
    for (const { command, folder } of commands) {
      if (run(command, folder) !== 0) {
        say(`${ref}: \`${command.join(' ')}\` failed.`)
        refused = true
      }
    }
  }
  if (refused)
    say(
      'Push refused. To push without the tests, give the reason: `SKIP_TESTS="<reason>" git push ...`; the audit still runs. ' +
        '`git push --no-verify` skips the whole hook: do not use it to get past what is above.',
    )
  return { refused }
}

if (import.meta.main) {
  const { refused } = verifyPush({
    root: process.cwd(),
    remote: process.argv[2] ?? 'origin',
    input: readFileSync(0, 'utf8'),
    run: (command, folder) =>
      spawnSync(command[0] as string, command.slice(1), {
        cwd: folder,
        env: envWithoutHookGit(),
        // Output goes to stderr: the hook's stdout belongs to git.
        stdio: ['ignore', 2, 2],
        shell: process.platform === 'win32',
      }).status,
    say: (text) => console.error(`[pre-push] ${text}`),
    env: process.env,
  })
  process.exit(refused ? 1 : 0)
}
