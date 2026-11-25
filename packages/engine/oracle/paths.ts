import { fileURLToPath } from 'node:url'

/** The repo root. */
export const ROOT = fileURLToPath(new URL('../../..', import.meta.url)).replace(
  /\/$/,
  '',
)

/** Where the harvested traces are cached, by the hash of their inputs. */
export const CACHE = `${ROOT}/node_modules/.cache/filmes-oracle`

/** Where each scenario starts: the fixture's filmes-dados (Portuguese). */
export const FIXTURE_DATA = `${ROOT}/tests/fixture/dados`

/** The Python engine's commands, as its CLI finds them. */
export const PYTHON_COMMANDS = `${ROOT}/filmes/comandos`
