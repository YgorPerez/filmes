// The engine's `rebuild` as a process, for `db:publish --build`
// (`db-build.ts`): the whole environment comes from the variables
// (`FILMES_CONFIG`, `FILMES_DADOS`, `FILMES_BANCO`, the dumps in
// `FILMES_CATALOGO` or `[paths] catalog` of the config's `local.toml`).
// Prints the outcome's JSON (`{"database", "tables"}` or `{"error"}`) and
// exits with its code. A process of its own, so the 16-minute build of the
// real catalog does not make `db:publish` asynchronous.
//
// Runs on plain `node`, which reads TypeScript by itself.

import { makeEngine, rebuild } from '@filmes/engine'

const engine = makeEngine(process.env)
try {
  const outcome = await engine.run(rebuild)
  process.stdout.write(`${JSON.stringify(outcome.output)}\n`)
  process.exitCode = outcome.exitCode
} finally {
  await engine.dispose()
}
