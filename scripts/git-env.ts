// Runs on plain `node`, without `node_modules`.

/** The environment without git's own variables. Inside a hook, git sets
 * `GIT_DIR` and friends, and a `git` run with them in another repository
 * would act on this one. */
export function envWithoutHookGit(env: NodeJS.ProcessEnv = process.env) {
  return Object.fromEntries(
    Object.entries(env).filter(([name]) => !name.startsWith('GIT_')),
  )
}
