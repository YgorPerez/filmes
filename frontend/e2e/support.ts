// What the e2e files share: `test`, on the file's own app server
// (`server-test.ts`), logging in as one of the fixture's Donos, a
// screenshot per screen, the regions and the notice of a page, and the
// engine over the file's fixture copy (`servers.ts`), to check what the app
// wrote or to prepare what a screen needs.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  makeEngine,
  personCreate,
  type Engine,
  type Outcome,
} from '@filmes/engine'
import { type Locator, type Page, type TestInfo } from '@playwright/test'
import { expect, test } from './server-test'
import { serverOf } from './servers'

export { expect, test }

/** The fixture copy of the running test's file: its `config/`, `data/`
 * and database. */
export const engineRoot = (): string => serverOf(test.info().file).engine

/** Runs `task` on an engine over the file's fixture copy and gives its output; an
 * engine error fails the test. `vars` add to the engine's variables. */
export async function engineRun<A>(
  task: (engine: Engine) => Promise<Outcome<A>>,
  vars: Readonly<Record<string, string>> = {},
): Promise<A> {
  const root = engineRoot()
  const engine = makeEngine({
    FILMES_CONFIG: `${root}/config`,
    FILMES_DADOS: `${root}/data`,
    FILMES_BANCO: `${root}/filmes.sqlite`,
    FILMES_HOJE: '2026-11-20',
    ...vars,
  })
  try {
    const outcome = await task(engine)
    if (outcome.exitCode !== 0) throw new Error(JSON.stringify(outcome.output))
    return outcome.output
  } finally {
    await engine.dispose()
  }
}

/** A Pessoa of one test alone: the file's other tests and its other
 * project read the fixture's Pessoas on the same copy, and an import or a
 * Já vi changes their Declarados and Notas. On a retry she is already
 * there. */
export async function addPerson(name: string) {
  await engineRun((engine) => engine.run(personCreate({ name }))).catch(
    (error: Error) => {
      if (!error.message.includes('person_exists')) throw error
    },
  )
}

/** Through the stand-in Google as the Dono with `email`, to the home. The
 * fixture has two: Bruno (`bruno@example.org`), whom `operations.e2e.ts`
 * makes admin on its own copy, and Vera (`vera@example.org`), who is not. */
export async function loginAs(page: Page, email: string) {
  await page.goto('/')
  await page.getByRole('link', { name: 'Entrar com Google' }).click()
  await page.getByLabel('E-mail').fill(email)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page).toHaveURL(/\/$/)
}

/** Makes Bruno admin on the copy (`operations.e2e.ts`, `owners.e2e.ts`):
 * the other files do not mind. */
export function makeBrunoAdmin() {
  const file = join(engineRoot(), 'data/people/bruno.md')
  const text = readFileSync(file, 'utf8')
  if (!/^admin: true$/m.test(text))
    writeFileSync(file, text.replace(/^---\n/, '---\nadmin: true\n'))
}

/** `loginAs` Bruno. */
export const loginAsBruno = (page: Page) => loginAs(page, 'bruno@example.org')

/** With `E2E_SCREENSHOTS=<folder>`, a full-page capture named by project;
 * with `part`, only that part of the page. */
export async function snap(
  page: Page,
  info: TestInfo,
  name: string,
  part?: Locator,
) {
  const folder = process.env.E2E_SCREENSHOTS
  if (!folder) return
  const path = join(folder, `${info.project.name}-${name}.png`)
  await (part
    ? part.screenshot({ path })
    : page.screenshot({ path, fullPage: true }))
}

/** A section of the page by its exact title. */
export const section = (page: Page, name: string) =>
  page.getByRole('region', { name, exact: true })

/** What the last action did (`role="status"`). */
export const notice = (page: Page) => page.getByRole('status')
