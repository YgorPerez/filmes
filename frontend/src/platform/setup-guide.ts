// The home (#143, map #140): the Guia de início while a step is pending and
// not skipped, the latest Sessão the Dono was in, and the MCP connector's
// address. The engine says which steps are done and keeps the skipped ones
// in her Pessoa file (`setupGuideFromEngine`, `people.ts`); the connector
// step is done when `auth.sqlite` holds an OAuth grant for her email (the
// Claude app connected as her). A skip posts to `/inicio/pular`, signed by
// her, and goes back home. Server only.

import type { DatabaseSync } from 'node:sqlite'
import {
  filmCovers,
  requestToday,
  SETUP_STEPS,
  type SetupStep,
  type SetupStepState,
} from '@filmes/engine'
import { openAuthDatabase } from './auth-database'
import { appPoster, formPoster, seeOther } from './form-post'
import { appSetupGuide, type Owner, type SetupGuideSource } from './people'
import { serverEnv } from './server-env'
import { appEngine } from './engine'
import { appSessionList, valueOf, type SessionItem } from './sessions'

/** A step as the home shows it. */
export type SetupStepView = SetupStepState

/** The Sessão the home shows. */
export type LatestSession = SessionItem

/** Where the Dono stands in the guide: every step, done, skipped or
 * pending, and her Notas toward the 10 of Meu gosto. */
export type SetupView = { steps: SetupStepView[]; ratings: number }

/** What the home shows. */
export type HomeData = {
  /** The Dono's slug: her Pessoa and import pages. */
  person: string
  /** The guide, also once complete (the home hides it then); null when the
   * engine cannot say. */
  setup: SetupView | null
  /** The latest Sessão she was in still to tell, else the latest one;
   * null with none. */
  latest: LatestSession | null
  /** Where the Claude app connects (`/mcp`); null without `APP_ORIGIN`. */
  mcpUrl: string | null
  /** Today (`YYYY-MM-DD`), so the latest Sessão says "Hoje" or "Ontem";
   * null when the engine cannot say. */
  today: string | null
  /** The latest Sessão's covers by IMDb id; a film missing or null has
   * none, and its row shows the tape's spine. */
  covers: Record<string, string | null>
}

/** What the home asks the engine besides the guide and the Sessions:
 * today's date and the latest Sessão's covers. */
export interface HomeShelf {
  today(): Promise<string | null>
  covers(films: readonly string[]): Promise<Record<string, string | null>>
}

const NO_SHELF: HomeShelf = {
  today: async () => null,
  covers: async () => ({}),
}

/** The Claude app holds a connection (an OAuth grant) for the email. */
export function hasConnector(db: DatabaseSync, email: string): boolean {
  return (
    db
      .prepare(
        'SELECT 1 FROM oauth_grants WHERE lower(email) = lower(?) LIMIT 1',
      )
      .get(email) !== undefined
  )
}

/** The guide and the connector's address, as the home and Meu gosto
 * show them (#222): what the engine cannot say is null. */
async function startData(
  owner: Owner,
  source: SetupGuideSource,
  origin: string | undefined,
): Promise<Pick<HomeData, 'setup' | 'mcpUrl'>> {
  const guide = valueOf(await source.guide(owner))
  return {
    setup: guide && {
      steps: guide.steps.map((s) => ({ ...s })),
      ratings: guide.ratings,
    },
    mcpUrl: origin === undefined ? null : `${origin}/mcp`,
  }
}

/** What `/` shows to the logged-in Dono, from the guide and every Sessão
 * (the latest first; null when the engine could not list them). The home
 * never fails: what the engine cannot say is left out. */
export async function homeData(
  owner: Owner,
  source: SetupGuideSource,
  sessions: readonly SessionItem[] | null,
  origin: string | undefined,
  shelf: HomeShelf = NO_SHELF,
): Promise<HomeData> {
  const mine =
    sessions?.filter((s) =>
      s.attendees.some((a) => a.person === owner.person),
    ) ?? []
  // The latest still to tell comes first (#272): it is the one waiting
  // for her, with "Contar como foi" at hand.
  const latest = mine.find((s) => s.open) ?? mine[0] ?? null
  const [start, today, covers] = await Promise.all([
    startData(owner, source, origin),
    shelf.today(),
    latest ? shelf.covers(latest.recommendation.map((f) => f.id)) : {},
  ])
  return { person: owner.person, ...start, latest, today, covers }
}

const isSetupStep = (value: unknown): value is SetupStep =>
  typeof value === 'string' &&
  (SETUP_STEPS as readonly string[]).includes(value)

/** `POST /inicio/pular`: keeps the form's step (`passo`) skipped, as the
 * logged-in Dono, and goes back home. Only a Dono, and only a form of this
 * site. A step it does not know writes nothing. */
export async function setupSkipAction(
  request: Request,
  owner: Owner | null,
  source: SetupGuideSource,
  origin: string | undefined,
): Promise<Response> {
  const poster = formPoster(request, owner, origin)
  if (poster instanceof Response) return poster
  const step = (await request.formData()).get('passo')
  if (isSetupStep(step)) valueOf(await source.skip(poster, step))
  return seeOther('/')
}

// --- the app's -----------------------------------------------------------------

/** Whether the Claude app connected with the email, from `auth.sqlite`. */
function appConnected(email: string): boolean {
  const db = openAuthDatabase(serverEnv().AUTH_DATABASE_PATH)
  try {
    return hasConnector(db, email)
  } finally {
    db.close()
  }
}

/** Today and the covers from the app's engine. */
const appShelf: HomeShelf = {
  today: async () => valueOf(await appEngine().run(requestToday)),
  covers: async (films) =>
    valueOf(await appEngine().run(filmCovers({ films }))) ?? {},
}

/** The home for the app, for the logged-in Dono. */
export const appHome = async (owner: Owner) =>
  homeData(
    owner,
    appSetupGuide(appConnected),
    await appSessionList(owner.person),
    serverEnv().APP_ORIGIN,
    appShelf,
  )

/** Meu gosto's part of the guide for the app, for the logged-in Dono. */
export const appMyStart = (owner: Owner) =>
  startData(owner, appSetupGuide(appConnected), serverEnv().APP_ORIGIN)

/** The skip form's route for the app. */
export const serveSetupSkip = (request: Request) => {
  const { owner, origin } = appPoster(request)
  return setupSkipAction(request, owner, appSetupGuide(appConnected), origin)
}
