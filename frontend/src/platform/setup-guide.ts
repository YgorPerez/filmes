// The home (#143, map #140): the Guia de início while a step is pending and
// not skipped, the latest Sessão the Dono was in, and the MCP connector's
// address. The engine says which steps are done and keeps the skipped ones
// in her Pessoa file (`setupGuideFromEngine`, `people.ts`); the connector
// step is done when `auth.sqlite` holds an OAuth grant for her email (the
// Claude app connected as her). A skip posts to `/inicio/pular`, signed by
// her, and goes back home. Server only.

import type { DatabaseSync } from 'node:sqlite'
import {
  SETUP_STEPS,
  type SetupStep,
  type SetupStepState,
} from '@filmes/engine'
import { openAuthDatabase } from './auth-database'
import { appPoster, formPoster, seeOther } from './form-post'
import { appSetupGuide, type Owner, type SetupGuideSource } from './people'
import { serverEnv } from './server-env'
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
  /** The guide, also once complete (the home's membership card shows its
   * stamps); null when the engine cannot say. */
  setup: SetupView | null
  /** The latest Sessão she was in, or null. */
  latest: LatestSession | null
  /** How many Sessões there are; null when the engine could not list them. */
  sessions: number | null
  /** Where the Claude app connects (`/mcp`); null without `APP_ORIGIN`. */
  mcpUrl: string | null
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

/** What `/` shows to the logged-in Dono, from the guide and every Sessão
 * (the latest first; null when the engine could not list them). The home
 * never fails: what the engine cannot say is left out. */
export async function homeData(
  owner: Owner,
  source: SetupGuideSource,
  sessions: readonly SessionItem[] | null,
  origin: string | undefined,
): Promise<HomeData> {
  const guide = valueOf(await source.guide(owner))
  return {
    person: owner.person,
    setup: guide && {
      steps: guide.steps.map((s) => ({ ...s })),
      ratings: guide.ratings,
    },
    latest:
      sessions?.find((s) =>
        s.attendees.some((a) => a.person === owner.person),
      ) ?? null,
    sessions: sessions?.length ?? null,
    mcpUrl: origin === undefined ? null : `${origin}/mcp`,
  }
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

/** The home for the app, for the logged-in Dono. */
export const appHome = async (owner: Owner) =>
  homeData(
    owner,
    appSetupGuide(appConnected),
    await appSessionList(owner.person),
    serverEnv().APP_ORIGIN,
  )

/** The skip form's route for the app. */
export const serveSetupSkip = (request: Request) => {
  const { owner, origin } = appPoster(request)
  return setupSkipAction(request, owner, appSetupGuide(appConnected), origin)
}
