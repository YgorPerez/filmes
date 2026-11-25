// What the e2e files share: logging in as the fixture's Dono, a screenshot
// per screen, the regions and the notice of a page, and the engine over the
// fixture copy the app serves (`playwright.config.ts`), to check what the
// app wrote or to prepare what a screen needs.

import { join } from 'node:path'
import { makeEngine, type Engine, type Outcome } from '@filmes/engine'
import { expect, type Page, type TestInfo } from '@playwright/test'

/** Runs `task` on an engine over the fixture copy and gives its output; an
 * engine error fails the test. */
export async function engineRun<A>(
  task: (engine: Engine) => Promise<Outcome<A>>,
): Promise<A> {
  const root = process.env.E2E_ENGINE
  const engine = makeEngine({
    FILMES_CONFIG: `${root}/config`,
    FILMES_DADOS: `${root}/data`,
    FILMES_BANCO: `${root}/filmes.sqlite`,
    FILMES_HOJE: '2026-11-20',
  })
  try {
    const outcome = await task(engine)
    if (outcome.exitCode !== 0) throw new Error(JSON.stringify(outcome.output))
    return outcome.output
  } finally {
    await engine.dispose()
  }
}

/** Through the stand-in Google as Bruno, the fixture's Dono, to the home. */
export async function loginAsBruno(page: Page) {
  await page.goto('/')
  await page.getByRole('link', { name: 'Entrar com Google' }).click()
  await page.getByLabel('E-mail').fill('bruno@example.org')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page).toHaveURL(/\/$/)
}

/** With `E2E_SCREENSHOTS=<folder>`, a full-page capture named by project. */
export async function snap(page: Page, info: TestInfo, name: string) {
  const folder = process.env.E2E_SCREENSHOTS
  if (!folder) return
  await page.screenshot({
    path: join(folder, `${info.project.name}-${name}.png`),
    fullPage: true,
  })
}

/** A section of the page by its exact title. */
export const section = (page: Page, name: string) =>
  page.getByRole('region', { name, exact: true })

/** What the last action did (`role="status"`). */
export const notice = (page: Page) => page.getByRole('status')
