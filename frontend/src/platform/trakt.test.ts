import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import {
  useFixture,
  type Fixture,
} from '../../../packages/engine/test/fixture.ts'
import { TRAKT_REVOKED } from '@filmes/engine'
import { Auth } from './auth'
import { ownersFromDataRepo } from './owners'
import { peopleFromDataRepo } from './people-directory'
import { handleTraktRequest, Trakt, traktConnection, traktPage } from './trakt'

const ORIGIN = 'https://cinema.example'
const ACCOUNT = { person: 'iara', email: 'iara@example.org' }

async function setup(fixture: Fixture) {
  let now = Date.UTC(2026, 10, 20)
  const databasePath = join(fixture.root, 'auth.sqlite')
  const auth = new Auth({
    origin: ORIGIN,
    clientId: 'google-test',
    clientSecret: 'google-secret-test',
    databasePath,
    owners: ownersFromDataRepo(fixture.data),
    personByEmail: peopleFromDataRepo(fixture.data).byEmail,
    now: () => now,
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
  const fetchToken = vi.fn<typeof fetch>()
  const trakt = new Trakt({
    origin: ORIGIN,
    clientId: 'public-test',
    tokenKey: Buffer.alloc(32, 42),
    databasePath,
    fetch: fetchToken,
    now: () => now,
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
  return {
    cookie,
    identity,
    databasePath,
    fetchToken,
    trakt,
    post,
    begin,
    expire: () => {
      now += 86_400_000
    },
  }
}

const issued = (version: string) =>
  Response.json({
    access_token: `trakt-access-${version}`,
    refresh_token: `trakt-refresh-${version}`,
    expires_in: 3600,
  })

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
  await post('/trakt/desconectar')
  expect(trakt.connected(identity)).toBe(false)
  expect(await access()).toBeNull()
  // The disconnect also revokes the token on Trakt.
  const [revokeUrl, revokeInit] = fetchToken.mock.calls[2]!
  expect(revokeUrl).toBe('https://api.trakt.tv/oauth/revoke')
  expect(
    JSON.parse(typeof revokeInit?.body === 'string' ? revokeInit.body : '{}'),
  ).toEqual({ token: 'trakt-access-renewed', client_id: 'public-test' })
})

test('a disconnect goes through when Trakt does not take the revoke', async () => {
  const { identity, fetchToken, trakt, post, begin } = await setup(useFixture())
  const { callback } = await begin()
  fetchToken.mockResolvedValueOnce(issued('original'))
  await trakt.handle(callback, identity)
  fetchToken.mockRejectedValueOnce(new Error('no network'))
  expect((await post('/trakt/desconectar')).headers.get('Location')).toBe(
    '/trakt',
  )
  expect(fetchToken).toHaveBeenCalledTimes(2)
  expect(trakt.connected(identity)).toBe(false)
})

test('a refresh token Trakt refuses drops the grant, so the Pessoa reconnects', async () => {
  const { identity, fetchToken, trakt, begin, expire } =
    await setup(useFixture())
  const { callback } = await begin()
  fetchToken.mockResolvedValueOnce(issued('original'))
  await trakt.handle(callback, identity)
  expire()
  fetchToken.mockResolvedValueOnce(
    Response.json({ error: 'invalid_grant' }, { status: 401 }),
  )
  const access = () => trakt.accessToken(identity, new AbortController().signal)
  expect(await access()).toBe(TRAKT_REVOKED)
  expect(trakt.connected(identity)).toBe(false)
  expect(await access()).toBeNull()
  expect(fetchToken).toHaveBeenCalledTimes(2)
})

test('another error on refresh keeps the grant for the next try', async () => {
  const { identity, fetchToken, trakt, begin, expire } =
    await setup(useFixture())
  const { callback } = await begin()
  fetchToken.mockResolvedValueOnce(issued('original'))
  await trakt.handle(callback, identity)
  expire()
  fetchToken.mockResolvedValueOnce(new Response('busy', { status: 503 }))
  const access = () => trakt.accessToken(identity, new AbortController().signal)
  await expect(access()).rejects.toThrow('Trakt OAuth exchange failed')
  expect(trakt.connected(identity)).toBe(true)
  fetchToken.mockResolvedValueOnce(issued('renewed'))
  expect(await access()).toBe('trakt-access-renewed')
})

test('tokens renewed after the lease ran out are kept, not dropped', async () => {
  const { identity, fetchToken, trakt, begin, expire } =
    await setup(useFixture())
  const { callback } = await begin()
  fetchToken.mockResolvedValueOnce(issued('original'))
  await trakt.handle(callback, identity)
  expire()
  const access = () => trakt.accessToken(identity, new AbortController().signal)
  const slow = Promise.withResolvers<Response>()
  fetchToken.mockReturnValueOnce(slow.promise)
  const first = access()
  // The first refresh outlives its lease, and another process claims it.
  expire()
  const late = Promise.withResolvers<Response>()
  fetchToken.mockReturnValueOnce(late.promise)
  const second = access()
  slow.resolve(issued('renewed'))
  expect(await first).toBe('trakt-access-renewed')
  late.resolve(Response.json({ error: 'invalid_grant' }, { status: 400 }))
  await expect(second).rejects.toThrow('Trakt grant has changed')
  expect(trakt.connected(identity)).toBe(true)
  expect(await access()).toBe('trakt-access-renewed')
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
  // The code, the refresh and the disconnect's revoke.
  expect(fetchToken).toHaveBeenCalledTimes(3)
  expect(trakt.connected(identity)).toBe(false)
})

test('the app reads Trakt from its environment and only for a verified Pessoa', async () => {
  // The app's own instances read the clock and the global fetch.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(Date.UTC(2026, 10, 20))
  vi.stubGlobal('fetch', () => Promise.reject(new Error('no network in tests')))
  const fixture = useFixture()
  const { cookie, databasePath, identity, fetchToken, trakt, begin } =
    await setup(fixture)
  const env = {
    APP_ORIGIN: ORIGIN,
    GOOGLE_CLIENT_ID: 'google-test',
    GOOGLE_CLIENT_SECRET: 'google-secret-test',
    AUTH_DATABASE_PATH: databasePath,
    DATA_REPO_PATH: fixture.data,
    FILMES_TRAKT_CLIENT_ID: 'public-test',
    FILMES_TRAKT_TOKEN_KEY: Buffer.alloc(32, 42).toString('base64'),
  }
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

  for (const [off, engineToo] of [
    [{ FILMES_TRAKT_CLIENT_ID: '' }, true],
    [{ FILMES_TRAKT_TOKEN_KEY: Buffer.alloc(16).toString('base64') }, true],
    [{ APP_ORIGIN: 'http://cinema.example' }, true],
    [{ GOOGLE_CLIENT_ID: '' }, false],
  ] as const) {
    stub(off)
    expect(page()).toEqual({ status: 'unavailable' })
    expect((await connect())?.headers.get('Location')).toBe('/trakt')
    expect(traktConnection({ ...env, ...off }) === undefined).toBe(engineToo)
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

  const engine = traktConnection(env)!
  expect(engine.clientId).toBe('public-test')
  const signal = new AbortController().signal
  expect(await engine.accessToken('iara', signal)).toBe('trakt-access-original')
  expect(await engine.accessToken('vera', signal)).toBeNull()
  expect(await engine.accessToken('ninguem', signal)).toBeNull()
  expect(await engine.accessToken('../people/iara', signal)).toBeNull()
})
