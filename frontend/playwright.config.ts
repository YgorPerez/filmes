// The app in the browser, over the build's SSR server (`pnpm build`), as it
// goes to production, with a stand-in for Google (`e2e/fake-google.ts`) and
// the engine's fixture: the fixture's Pessoas in English (Bruno is Dono, Iara
// is not), the English config and the database the engine's `rebuild` builds
// from `tests/fixture`. `pnpm e2e`
// builds and starts both servers. The files end in `.e2e.ts`, so Vitest
// leaves them alone.

import { cpSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import buildEngineFixture from '../packages/engine/test/global-setup.ts'
import { FIXTURE_ENV, FIXTURE_TODAY } from '../packages/engine/test/paths.ts'

const port = Number(process.env.E2E_PORT ?? 4512)
const googlePort = Number(process.env.E2E_GOOGLE_PORT ?? port + 1)

// A database for this run alone. The workers read this config again and
// inherit the variable.
process.env.E2E_AUTH_DATABASE ??= join(
  mkdtempSync(join(tmpdir(), 'e2e-auth-')),
  'auth.sqlite',
)

// A copy of the engine's fixture for this run alone (the app may write the
// sources' cache next to the database), built once: the workers inherit it.
if (!process.env.E2E_ENGINE) {
  await buildEngineFixture()
  const copy = mkdtempSync(join(tmpdir(), 'e2e-engine-'))
  cpSync(process.env[FIXTURE_ENV]!, copy, { recursive: true })
  process.env.E2E_ENGINE = copy
}
const engine = process.env.E2E_ENGINE

const appEnv = [
  `APP_ORIGIN=http://localhost:${port}`,
  'GOOGLE_CLIENT_ID=e2e',
  'GOOGLE_CLIENT_SECRET=e2e',
  `GOOGLE_STUB_ORIGIN=http://localhost:${googlePort}`,
  `AUTH_DATABASE_PATH=${process.env.E2E_AUTH_DATABASE}`,
  `DATA_REPO_PATH=${engine}/data`,
  `FILMES_CONFIG=${engine}/config`,
  `FILMES_DATABASE=${engine}/filmes.sqlite`,
  `FILMES_HOJE=${FIXTURE_TODAY}`,
  // Operações: the Catalog `evaluate` measures, and its reports' folder.
  'FILMES_CATALOGO=../tests/fixture/catalogo',
  `FILMES_AVALIACOES=${engine}/evaluations`,
  // Recorded answers, never the network: with a key, TMDB answers from the
  // recordings too (the Imports' queue), and OMDb and Does the Dog Die (the
  // child and trigger Restrições of a new Session).
  'FILMES_GRAVACOES=../tests/fixture/gravacoes',
  'FILMES_TMDB_CHAVE=e2e',
  'FILMES_OMDB_CHAVE=e2e',
  'FILMES_DDD_CHAVE=e2e',
  `PORT=${port}`,
].join(' ')

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    // The Chrome installed on the machine; GitHub's ubuntu image has it too.
    channel: 'chrome',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Before the others: Bruno, the fixture's one Dono, is not admin yet
    // (`operations.e2e.ts` makes him admin on the copy).
    {
      name: 'not-admin',
      testMatch: '**/not-admin.e2e.ts',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
    {
      name: 'mobile',
      testIgnore: '**/not-admin.e2e.ts',
      dependencies: ['not-admin'],
      use: { ...devices['Pixel 7'], channel: 'chrome' },
    },
    {
      name: 'desktop',
      testIgnore: '**/not-admin.e2e.ts',
      dependencies: ['not-admin'],
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
  webServer: [
    {
      command: `PORT=${googlePort} node e2e/fake-google.ts`,
      url: `http://localhost:${googlePort}/`,
      reuseExistingServer: false,
    },
    {
      command: `pnpm build && ${appEnv} node .output/server/index.mjs`,
      url: `http://localhost:${port}/entrar`,
      reuseExistingServer: false,
      stdout: 'ignore',
      stderr: 'pipe',
      timeout: 180_000,
    },
  ],
})
