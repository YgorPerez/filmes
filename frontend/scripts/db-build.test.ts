// `db:publish --build` refuses a filmes-dados it must not build from (#258),
// on real git repositories in a temporary folder.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import { checkDataCheckout, headOf } from './db-build.ts'

/** git with a fixed author and nothing of the caller's `GIT_*`. */
function git(cwd: string, ...args: string[]) {
  const env: Record<string, string | undefined> = {}
  for (const [name, value] of Object.entries(process.env))
    if (!name.startsWith('GIT_')) env[name] = value
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.org',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.org',
    },
  })
}

/** A remote with one commit, the local clone `data`, and a second clone
 * that stands for the VPS. */
function aDataCheckout() {
  const root = mkdtempSync(join(tmpdir(), 'data-checkout-'))
  const remote = join(root, 'remote.git')
  git(root, 'init', '--quiet', '--bare', '-b', 'master', remote)
  const vps = join(root, 'vps')
  git(root, 'clone', '--quiet', remote, vps)
  git(vps, 'commit', '--quiet', '--allow-empty', '-m', 'first')
  git(vps, 'push', '--quiet', 'origin', 'HEAD:master')
  const data = join(root, 'data')
  git(root, 'clone', '--quiet', remote, data)
  return { root, data, vps }
}

const check = (data: string) => {
  const said: string[] = []
  checkDataCheckout(data, (line) => said.push(line))
  return said
}

describe('checkDataCheckout', () => {
  it('lets a checkout up to date with its remote build', () => {
    const { data } = aDataCheckout()
    expect(check(data)).toEqual([])
  })

  it('refuses a checkout behind what the VPS pushed, and says to pull', () => {
    const { data, vps } = aDataCheckout()
    git(vps, 'commit', '--quiet', '--allow-empty', '-m', 'a Nota')
    git(vps, 'commit', '--quiet', '--allow-empty', '-m', 'a Sessão')
    git(vps, 'push', '--quiet', 'origin', 'HEAD:master')

    expect(() => check(data)).toThrow(
      `${data} is 2 commits behind its remote: git -C ${data} pull, then build.`,
    )
  })

  it('refuses a checkout with uncommitted changes', () => {
    const { data } = aDataCheckout()
    writeFileSync(join(data, 'olga.md'), '---\nname: Olga\n---\n')

    expect(() => check(data)).toThrow(
      `${data} has uncommitted changes: commit or discard them, then build.`,
    )
  })

  it('builds a folder that is not a checkout of its own as it is', () => {
    const { root, data } = aDataCheckout()
    const inside = join(data, 'people')
    mkdirSync(inside)
    const plain = join(root, 'plain')
    mkdirSync(plain)

    expect(check(inside)).toEqual([
      `${inside} is not a git checkout of its own: built as it is`,
    ])
    expect(check(plain)).toEqual([
      `${plain} is not a git checkout of its own: built as it is`,
    ])
  })
})

describe('headOf', () => {
  it("is the checkout's commit", () => {
    const { vps } = aDataCheckout()
    expect(headOf(vps)).toBe(git(vps, 'rev-parse', 'HEAD').trim())
  })
})
