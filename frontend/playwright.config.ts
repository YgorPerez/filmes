// The app in the browser, over the build's SSR server (`pnpm build`), as it
// goes to production, with a stand-in for Google (`e2e/fake-google.ts`) and
// the engine's fixture: the fixture's Pessoas in English (Bruno and Vera are
// Donos, Iara is not), the English config and the database the engine's `rebuild` builds
// from `tests/fixture`. `pnpm e2e` builds once and starts the stand-in and
// one app server per e2e file, each over a copy of its own
// (`e2e/servers.ts`). The files end in `.e2e.ts`, so Vitest leaves them
// alone.

import { cpSync, mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { defineConfig, devices } from '@playwright/test'
import buildEngineFixture from '../packages/engine/test/global-setup.ts'
import { FIXTURE_ENV, FIXTURE_TODAY } from '../packages/engine/test/paths.ts'
import {
  BASE_PORT,
  E2E_FILES,
  serverOf,
  type E2EServer,
} from './e2e/servers.ts'

const googlePort = Number(process.env.E2E_GOOGLE_PORT ?? BASE_PORT + 1)

// The copies of the engine's fixture for this run alone (the app may write
// the sources' cache next to the database), built once: the workers read
// this config again and inherit the variable.
if (!process.env.E2E_SERVERS) {
  await buildEngineFixture()
  process.env.E2E_SERVERS = mkdtempSync(`${tmpdir()}/e2e-servers-`)
  for (const file of E2E_FILES) {
    const { engine } = serverOf(file)
    mkdirSync(engine, { recursive: true })
    cpSync(process.env[FIXTURE_ENV]!, engine, { recursive: true })
  }
}

const appEnv = ({ port, origin, engine, authDatabase }: E2EServer) =>
  [
    `APP_ORIGIN=${origin}`,
    'GOOGLE_CLIENT_ID=e2e',
    'GOOGLE_CLIENT_SECRET=e2e',
    `GOOGLE_STUB_ORIGIN=http://localhost:${googlePort}`,
    `AUTH_DATABASE_PATH=${authDatabase}`,
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

// Playwright starts the web servers one after the other: the first file's
// builds the app, and the others serve that build.
const appServers = E2E_FILES.map((file, index) => {
  const server = serverOf(file)
  return {
    command: `${index === 0 ? 'pnpm build && ' : ''}${appEnv(server)} node .output/server/index.mjs`,
    url: `${server.origin}/entrar`,
    reuseExistingServer: false,
    stdout: 'ignore' as const,
    stderr: 'pipe' as const,
    timeout: index === 0 ? 180_000 : 60_000,
  }
})

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  // `baseURL` is each file's server, from `test` in `e2e/support.ts`.
  use: {
    // The Chrome installed on the machine; GitHub's ubuntu image has it too.
    channel: 'chrome',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], channel: 'chrome' },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
  webServer: [
    {
      command: `PORT=${googlePort} node e2e/fake-google.ts`,
      url: `http://localhost:${googlePort}/`,
      reuseExistingServer: false,
    },
    ...appServers,
  ],
})
