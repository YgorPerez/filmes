import { fileURLToPath } from 'node:url'

/** The repo root. */
export const ROOT = fileURLToPath(new URL('../../..', import.meta.url))

/** The fixture's "today", as in the Python tests (`FILMES_HOJE`). */
export const FIXTURE_TODAY = '2026-11-20'

/** Where the global setup tells the workers the built fixture is. */
export const FIXTURE_ENV = 'FILMES_ENGINE_TEST_FIXTURE'
