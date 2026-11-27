import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, vi } from 'vite-plus/test'
import {
  useFixture,
  type Fixture,
} from '../../../packages/engine/test/fixture.ts'
import { Auth } from './auth'
import { ownersFromDataRepo, peopleFromDataRepo } from './owners'
import { Trakt } from './trakt'

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
