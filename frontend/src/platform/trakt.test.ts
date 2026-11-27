import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import {
  useFixture,
  type Fixture,
} from '../../../packages/engine/test/fixture.ts'
import { Auth } from './auth'
import { ownersFromDataRepo } from './owners'
import { peopleFromDataRepo } from './people-directory'
import {
  handleTraktRequest,
  Trakt,
  traktConnection,
  traktLink,
  traktPage,
} from './trakt'

const ORIGIN = 'https://cinema.example'
const ACCOUNT = { person: 'iara', email: 'iara@example.org' }

type Clock = { now: number }

/** Iara signs in with Google for `/trakt`: her browser's cookie and her
 * verified identity. */
async function signIn(fixture: Fixture, clock: Clock) {
  const databasePath = join(fixture.root, 'auth.sqlite')
  const auth = new Auth({
    origin: ORIGIN,
    clientId: 'google-test',
    clientSecret: 'google-secret-test',
    databasePath,
    owners: ownersFromDataRepo(fixture.data),
    personByEmail: peopleFromDataRepo(fixture.data).byEmail,
    now: () => clock.now,
    fetch: async (input) =>
      (input instanceof Request ? input.url : input.toString()).endsWith(
        '/token',
      )
        ? Response.json({ access_token: 'google-access-test' })
        : Response.json({ email: ACCOUNT.email, email_verified: true }),
  })
  const login = await auth.handle(new Request(`${ORIGIN}/auth/trakt-google`))
  const state = new URL(login!.headers.get('Location')!).searchParams.get(
    'state',
  )
  const browser = login!.headers.getSetCookie()[0]!.split(';')[0]!
  const authenticated = await auth.handle(
    new Request(`${ORIGIN}/auth/callback?state=${state}&code=google-code`, {
      headers: { Cookie: browser },
    }),
  )
  expect(authenticated?.headers.get('Location')).toBe('/trakt')
  const cookie = authenticated!.headers.getSetCookie()[0]!.split(';')[0]!
  const request = new Request(`${ORIGIN}/trakt`, {
    headers: { Cookie: cookie },
  })
  expect(auth.current(request)).toBeNull()
  const verified = auth.verifiedSession(request)!
  const identity = { ...ACCOUNT, sessionHash: verified.hash }
  return { cookie, identity, databasePath }
}

/** The Trakt connection of her identity, with a fake token endpoint;
 * `begin` sends her to Trakt's consent and gives its callback. */
function traktOf(
  identity: { person: string; email: string; sessionHash: string },
  databasePath: string,
  clock: Clock,
) {
  const fetchToken = vi.fn<typeof fetch>()
  const trakt = new Trakt({
    origin: ORIGIN,
    clientId: 'public-test',
    tokenKey: Buffer.alloc(32, 42),
    databasePath,
    fetch: fetchToken,
    now: () => clock.now,
  })
  const post = (
    path: string,
    body: Record<string, string> = {},
    origin = ORIGIN,
  ) =>
    trakt.handle(
      new Request(`${ORIGIN}${path}`, {
        method: 'POST',
        headers: { Origin: origin },
        body: new URLSearchParams(body),
      }),
      identity,
    )
  const begin = async () => {
    const sent = await post('/trakt/conectar', { consentir: 'sim' })
    const url = new URL(sent.headers.get('Location')!)
    expect(url.origin + url.pathname).toBe(
      'https://auth.trakt.tv/oauth/authorize',
    )
    expect(url.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/trakt/retorno`)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    return {
      challenge: url.searchParams.get('code_challenge'),
      callback: new Request(
        `${ORIGIN}/trakt/retorno?code=trakt-code&state=${url.searchParams.get('state')}`,
      ),
    }
  }
  return { fetchToken, trakt, post, begin }
}

async function setup(fixture: Fixture) {
  const clock = { now: Date.UTC(2026, 10, 20) }
  const { cookie, identity, databasePath } = await signIn(fixture, clock)
  return {
    cookie,
    identity,
    databasePath,
    ...traktOf(identity, databasePath, clock),
    expire: () => {
      clock.now += 86_400_000
    },
  }
}

const issued = (version: string) =>
  Response.json({
    access_token: `trakt-access-${version}`,
    refresh_token: `trakt-refresh-${version}`,
    expires_in: 3600,
  })

/** The callback traded Trakt's code at its token endpoint, with the
 * verifier of the consent's challenge. */
function expectCodeExchange(
  fetchToken: ReturnType<typeof vi.fn<typeof fetch>>,
  challenge: string | null,
) {
  const [url, init] = fetchToken.mock.calls[0]!
  expect(url).toBe('https://auth.trakt.tv/oauth/token')
  const body = JSON.parse(
    typeof init?.body === 'string' ? init.body : '{}',
  ) as Record<string, string>
  expect(body).toMatchObject({
    client_id: 'public-test',
    grant_type: 'authorization_code',
    code: 'trakt-code',
  })
  expect(
    createHash('sha256').update(body.code_verifier!).digest('base64url'),
  ).toBe(challenge)
}

/** Expired, the token is renewed once with the refresh token, and the
 * renewed one is kept. */
async function expectRenewal(
  fetchToken: ReturnType<typeof vi.fn<typeof fetch>>,
  access: () => Promise<string | null>,
  expire: () => void,
) {
  expire()
  fetchToken.mockResolvedValueOnce(issued('renewed'))
  expect(await access()).toBe('trakt-access-renewed')
  expect(await access()).toBe('trakt-access-renewed')
  expect(fetchToken).toHaveBeenCalledTimes(2)
  const refreshBody = fetchToken.mock.calls[1]![1]?.body
  expect(
    JSON.parse(typeof refreshBody === 'string' ? refreshBody : '{}'),
  ).toMatchObject({
    grant_type: 'refresh_token',
    refresh_token: 'trakt-refresh-original',
  })
}

test('a verified Presente grants consent, refreshes encrypted tokens and can disconnect', async () => {
  const { identity, databasePath, fetchToken, trakt, post, begin, expire } =
    await setup(useFixture())
  const access = () => trakt.accessToken(identity, new AbortController().signal)
  expect(await access()).toBeNull()
  expect((await post('/trakt/conectar')).headers.get('Location')).toBe(
    '/trakt?erro=consentimento',
  )
  expect(
    (
      await post(
        '/trakt/conectar',
        { consentir: 'sim' },
        'https://other.example',
      )
    ).status,
  ).toBe(403)
  const { challenge, callback } = await begin()
  expect(trakt.connected(identity)).toBe(false)
  expect(
    (
      await trakt.handle(callback, {
        ...identity,
        sessionHash: 'different-browser',
      })
    ).headers.get('Location'),
  ).toBe('/trakt?erro=trakt')
  expect(fetchToken).not.toHaveBeenCalled()
  fetchToken.mockResolvedValueOnce(issued('original'))
  expect((await trakt.handle(callback, identity)).headers.get('Location')).toBe(
    '/trakt',
  )
  expectCodeExchange(fetchToken, challenge)
  expect((await trakt.handle(callback, identity)).headers.get('Location')).toBe(
    '/trakt?erro=trakt',
  )
  expect(await access()).toBe('trakt-access-original')
  expect(
    await trakt.accessToken(
      { ...identity, email: 'another@example.org' },
      new AbortController().signal,
    ),
  ).toBeNull()
  expect(readFileSync(databasePath).includes('trakt-access-original')).toBe(
    false,
  )
  expect(readFileSync(databasePath).includes('trakt-refresh-original')).toBe(
    false,
  )

  await expectRenewal(fetchToken, access, expire)
  await post('/trakt/desconectar')
  expect(trakt.connected(identity)).toBe(false)
  expect(await access()).toBeNull()
})

test('disconnect invalidates a callback that is exchanging its code', async () => {
  const { identity, fetchToken, trakt, post, begin } = await setup(useFixture())
  const { callback } = await begin()
  const token = Promise.withResolvers<Response>()
  fetchToken.mockReturnValueOnce(token.promise)
  const pending = trakt.handle(callback, identity)
  expect(fetchToken).toHaveBeenCalledOnce()
  await post('/trakt/desconectar')
  token.resolve(issued('late'))
  expect((await pending).headers.get('Location')).toBe('/trakt?erro=trakt')
  expect(trakt.connected(identity)).toBe(false)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

test('a request with no verified login or the wrong method changes nothing', async () => {
  const { identity, fetchToken, trakt, begin } = await setup(useFixture())
  const connect = new Request(`${ORIGIN}/trakt/conectar`, {
    method: 'POST',
    headers: { Origin: ORIGIN },
    body: new URLSearchParams({ consentir: 'sim' }),
  })
  expect((await trakt.handle(connect, null)).headers.get('Location')).toBe(
    '/trakt',
  )
  expect(
    (await trakt.handle(new Request(`${ORIGIN}/trakt/conectar`), identity))
      .status,
  ).toBe(405)
  const { callback } = await begin()
  const state = new URL(callback.url).searchParams.get('state')
  expect(
    (
      await trakt.handle(
        new Request(`${ORIGIN}/trakt/retorno?state=${state}`),
        identity,
      )
    ).headers.get('Location'),
  ).toBe('/trakt?erro=trakt')
  expect(fetchToken).not.toHaveBeenCalled()
  expect(trakt.connected(identity)).toBe(false)
})

test.each([
  ['an error status', () => new Response('nope', { status: 401 })],
  ['a body that is not an object', () => Response.json(null)],
  [
    'no refresh token',
    () => Response.json({ access_token: 'a', expires_in: 3600 }),
  ],
  [
    'a lifetime that is not positive',
    () =>
      Response.json({ access_token: 'a', refresh_token: 'r', expires_in: 0 }),
  ],
])(
  'Trakt answering with %s leaves the Pessoa disconnected',
  async (_, answer) => {
    const { identity, fetchToken, trakt, begin } = await setup(useFixture())
    const { callback } = await begin()
    fetchToken.mockResolvedValueOnce(answer())
    expect(
      (await trakt.handle(callback, identity)).headers.get('Location'),
    ).toBe('/trakt?erro=trakt')
    expect(trakt.connected(identity)).toBe(false)
  },
)

test('a refresh token is spent once, and a disconnect during the refresh keeps nothing', async () => {
  const { identity, fetchToken, trakt, post, begin, expire } =
    await setup(useFixture())
  const { callback } = await begin()
  fetchToken.mockResolvedValueOnce(issued('original'))
  await trakt.handle(callback, identity)
  expire()
  const renewed = Promise.withResolvers<Response>()
  fetchToken.mockReturnValueOnce(renewed.promise)
  const access = () => trakt.accessToken(identity, new AbortController().signal)
  const first = access()
  await expect(access()).rejects.toThrow('Trakt grant has changed')
  await post('/trakt/desconectar')
  renewed.resolve(issued('renewed'))
  expect(await first).toBeNull()
  expect(fetchToken).toHaveBeenCalledTimes(2)
  expect(trakt.connected(identity)).toBe(false)
})

/** The app's environment with Google and Trakt on. */
const appEnv = (fixture: Fixture, databasePath: string) => ({
  APP_ORIGIN: ORIGIN,
  GOOGLE_CLIENT_ID: 'google-test',
  GOOGLE_CLIENT_SECRET: 'google-secret-test',
  AUTH_DATABASE_PATH: databasePath,
  DATA_REPO_PATH: fixture.data,
  FILMES_TRAKT_CLIENT_ID: 'public-test',
  FILMES_TRAKT_TOKEN_KEY: Buffer.alloc(32, 42).toString('base64'),
})

test('the app reads Trakt from its environment and only for a verified Pessoa', async () => {
  // The app's own instances read the clock and the global fetch.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(Date.UTC(2026, 10, 20))
  vi.stubGlobal('fetch', () => Promise.reject(new Error('no network in tests')))
  const fixture = useFixture()
  const { cookie, databasePath, identity, fetchToken, trakt, begin } =
    await setup(fixture)
  const env = appEnv(fixture, databasePath)
  const stub = (variables: Partial<typeof env>) => {
    vi.unstubAllEnvs()
    for (const [name, value] of Object.entries({ ...env, ...variables }))
      vi.stubEnv(name, value)
  }
  const page = (headers: HeadersInit = { Cookie: cookie }) =>
    traktPage(new Request(`${ORIGIN}/trakt`, { headers }))
  const connect = (headers: Record<string, string> = { Cookie: cookie }) =>
    handleTraktRequest(
      new Request(`${ORIGIN}/trakt/conectar`, {
        method: 'POST',
        headers: { Origin: ORIGIN, ...headers },
        body: new URLSearchParams({ consentir: 'sim' }),
      }),
    )

  for (const off of [
    { FILMES_TRAKT_CLIENT_ID: '' },
    { FILMES_TRAKT_TOKEN_KEY: Buffer.alloc(16).toString('base64') },
    { APP_ORIGIN: 'http://cinema.example' },
    { GOOGLE_CLIENT_ID: '' },
  ]) {
    stub(off)
    expect(page()).toEqual({ status: 'unavailable' })
    expect((await connect())?.headers.get('Location')).toBe('/trakt')
    await expectNoToken({ ...env, ...off }, 'FILMES_TRAKT_CLIENT_ID' in off)
  }

  stub({})
  expect(handleTraktRequest(new Request(`${ORIGIN}/trakt`))).toBeNull()
  expect(page({})).toEqual({ status: 'login' })
  expect((await connect({}))?.headers.get('Location')).toBe('/trakt')
  expect(page()).toEqual({ status: 'disconnected', name: 'Iara' })
  expect(new URL((await connect())!.headers.get('Location')!).origin).toBe(
    'https://auth.trakt.tv',
  )

  const { callback } = await begin()
  fetchToken.mockResolvedValueOnce(issued('original'))
  await trakt.handle(callback, identity)
  expect(page()).toEqual({ status: 'connected', name: 'Iara' })

  await expectTokens(env)

  expectTraktLinks(env)
})

/** With part of its environment off, the app has no Pessoa's token. The
 * client id alone still reads public profiles (#269): only without it
 * (`noClient`) has the engine no Trakt. */
async function expectNoToken(env: NodeJS.ProcessEnv, noClient: boolean) {
  const engine = traktConnection(env)
  expect(engine === undefined).toBe(noClient)
  const token = await engine?.accessToken('iara', new AbortController().signal)
  expect(token ?? null).toBeNull()
}

/** The engine's Trakt gives Iara's token, once she connected, and no one
 * else's. */
async function expectTokens(env: NodeJS.ProcessEnv) {
  const engine = traktConnection(env)!
  expect(engine.clientId).toBe('public-test')
  const signal = new AbortController().signal
  expect(await engine.accessToken('iara', signal)).toBe('trakt-access-original')
  expect(await engine.accessToken('vera', signal)).toBeNull()
  expect(await engine.accessToken('ninguem', signal)).toBeNull()
  expect(await engine.accessToken('../people/iara', signal)).toBeNull()
}

/** The import page's word (#269), once Iara connected: whether the server
 * reads Trakt at all, and whether she connected hers. */
function expectTraktLinks(env: NodeJS.ProcessEnv) {
  expect(traktLink('iara')).toEqual({ available: true, connected: true })
  expect(traktLink('vera', env)).toEqual({ available: true, connected: false })
  expect(traktLink('iara', { ...env, FILMES_TRAKT_TOKEN_KEY: '' })).toEqual({
    available: true,
    connected: false,
  })
  expect(traktLink('iara', { ...env, FILMES_TRAKT_CLIENT_ID: '' })).toEqual({
    available: false,
    connected: false,
  })
}
