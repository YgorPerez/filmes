// The app server's environment variables, each one named here and nowhere
// else. Read on each call, so a variable set while the server runs counts.
// On the VPS they come from `/opt/filmes/app.env` (ADR 0006).

const optional = (value: string | undefined) => value?.trim() || undefined

export const serverEnv = (env: NodeJS.ProcessEnv = process.env) => ({
  /** The site's own address, e.g. `https://cinema.example`: the Google
   * redirect is `<APP_ORIGIN>/auth/callback`. Without it, login stays off. */
  APP_ORIGIN: optional(env.APP_ORIGIN),
  GOOGLE_CLIENT_ID: optional(env.GOOGLE_CLIENT_ID),
  GOOGLE_CLIENT_SECRET: optional(env.GOOGLE_CLIENT_SECRET),
  FILMES_TRAKT_CLIENT_ID: optional(env.FILMES_TRAKT_CLIENT_ID),
  /** A base64-encoded 32-byte AES key, kept in the VPS app environment. */
  FILMES_TRAKT_TOKEN_KEY: optional(env.FILMES_TRAKT_TOKEN_KEY),
  /** Web sessions and the MCP connector's OAuth clients and tokens (ADR 0005, 0007). */
  AUTH_DATABASE_PATH: optional(env.AUTH_DATABASE_PATH) ?? '/data/auth.sqlite',
  /** The filmes-dados checkout, where the Pessoas (and their `email:`) are. */
  DATA_REPO_PATH: optional(env.DATA_REPO_PATH) ?? '/data/filmes-dados',
  /** The derived SQLite the engine reads, `/data/db/<version>.sqlite` on the
   * VPS (`db:publish`, ADR 0006). Unset before the first publish: the pages
   * that need it say the engine is not ready, and the rest still answer. */
  FILMES_DATABASE: optional(env.FILMES_DATABASE),
  /** The e2e's stand-in for Google; ignored unless APP_ORIGIN is local. */
  GOOGLE_STUB_ORIGIN: optional(env.GOOGLE_STUB_ORIGIN),
})
