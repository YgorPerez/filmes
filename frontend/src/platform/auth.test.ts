import { createHash } from 'node:crypto'
import { cpSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import { Auth, authFromEnvironment } from './auth'
import { ownersFromDataRepo } from './owners'
import { serverEnv } from './server-env'

const ORIGIN = 'http://localhost:3000'
const FIXTURE = join(import.meta.dirname, '../../../tests/fixture/dados')

type Identity = { email: string; email_verified: boolean }

/** A Google that checks the PKCE verifier and answers with `identity`. */
function fakeGoogle(identity: () => Identity | 'down') {
  const challenges = new Map<string, string>()
  const calls: string[] = []
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString()
    calls.push(url)
    const current = identity()
    if (current === 'down') throw new Error('network')
    if (url.endsWith('/token')) {
      const form = new URLSearchParams(init?.body as URLSearchParams)
      const challenge = createHash('sha256')
        .update(form.get('code_verifier') ?? '')
        .digest('base64url')
      return challenges.get(form.get('code') ?? '') === challenge
        ? Response.json({ access_token: 'token' })
        : Response.json({ error: 'invalid_grant' }, { status: 400 })
    }
    return Response.json({ sub: '1', ...current })
  }) as typeof globalThis.fetch
  return { fetch, challenges, calls }
}

function setup(
  options: {
    data?: string
    identity?: () => Identity | 'down'
    configured?: boolean
  } = {},
) {
  let identity: Identity | 'down' = {
    email: 'Bruno@Example.org',
    email_verified: true,
  }
  const google = fakeGoogle(options.identity ?? (() => identity))
  const auth = new Auth({
    origin: ORIGIN,
    clientId: options.configured === false ? undefined : 'client',
    clientSecret: 'secret',
    databasePath: join(mkdtempSync(join(tmpdir(), 'auth-')), 'auth.sqlite'),
    owners: ownersFromDataRepo(options.data ?? FIXTURE),
    endpoints: {
      authorize: 'https://google.test/authorize',
      token: 'https://google.test/token',
      userinfo: 'https://google.test/userinfo',
    },
    fetch: google.fetch,
  })
  const request = (path: string, init: RequestInit = {}) =>
    auth.handle(new Request(`${ORIGIN}${path}`, init))
  /** Starts the login, lets Google give a code, and comes back. */
  async function login(cookie = '') {
    const start = (await request('/auth/google'))!
    const target = new URL(start.headers.get('location')!)
    const browser = start.headers.get('set-cookie')!.split(';')[0]!
    google.challenges.set('code', target.searchParams.get('code_challenge')!)
    const state = target.searchParams.get('state')!
    return request(`/auth/callback?state=${state}&code=code`, {
      headers: { cookie: [browser, cookie].filter(Boolean).join('; ') },
    })
  }
  const session = (response: Response) =>
    response.headers
      .getSetCookie()
      .find((c) => c.startsWith('local-session='))
      ?.split(';')[0]
  const owner = (cookie?: string) =>
    auth.current(
      new Request(`${ORIGIN}/`, { headers: cookie ? { cookie } : {} }),
    )
  return {
    auth,
    google,
    request,
    login,
    session,
    owner,
    setIdentity: (next: Identity | 'down') => (identity = next),
  }
}

describe('the Google login', () => {
  it('sends the browser to Google with PKCE and asks only for the email', async () => {
    const { request } = setup()
    const response = (await request('/auth/google'))!
    expect(response.status).toBe(303)
    const target = new URL(response.headers.get('location')!)
    expect(target.origin + target.pathname).toBe(
      'https://google.test/authorize',
    )
    expect(target.searchParams.get('scope')).toBe('openid email')
    expect(target.searchParams.get('code_challenge_method')).toBe('S256')
    expect(target.searchParams.get('redirect_uri')).toBe(
      `${ORIGIN}/auth/callback`,
    )
    expect(response.headers.get('set-cookie')).toMatch(
      /^local-google=.+; HttpOnly; SameSite=Lax/,
    )
  })

  it('lets a Dono in, whatever the case of the email', async () => {
    const { login, session, owner } = setup()
    const response = (await login())!
    expect(response.headers.get('location')).toBe('/')
    expect(owner(session(response))).toEqual({
      person: 'bruno',
      name: 'Bruno',
      email: 'bruno@example.org',
      admin: false,
    })
  })

  it('refuses a Pessoa with an email who is not Dono', async () => {
    const { login, session, setIdentity } = setup()
    setIdentity({ email: 'iara@example.org', email_verified: true })
    const response = (await login())!
    expect(response.headers.get('location')).toBe('/entrar?recusa=nao-dono')
    expect(session(response)).toBeUndefined()
  })

  it('refuses an email that is on no Pessoa', async () => {
    const { login, setIdentity } = setup()
    setIdentity({ email: 'stranger@example.org', email_verified: true })
    expect((await login())!.headers.get('location')).toBe(
      '/entrar?recusa=nao-dono',
    )
  })

  it('refuses an email Google has not verified', async () => {
    const { login, setIdentity } = setup()
    setIdentity({ email: 'bruno@example.org', email_verified: false })
    expect((await login())!.headers.get('location')).toBe(
      '/entrar?recusa=google',
    )
  })

  it('says Google failed when it does not answer', async () => {
    const { login, setIdentity } = setup()
    setIdentity('down')
    expect((await login())!.headers.get('location')).toBe(
      '/entrar?recusa=google',
    )
  })

  it('uses an attempt once, and only in the browser that started it', async () => {
    const { request, google } = setup()
    const start = (await request('/auth/google'))!
    const target = new URL(start.headers.get('location')!)
    const browser = start.headers.get('set-cookie')!.split(';')[0]!
    google.challenges.set('code', target.searchParams.get('code_challenge')!)
    const callback = `/auth/callback?state=${target.searchParams.get('state')}&code=code`

    const otherBrowser = await request(callback, {
      headers: { cookie: 'local-google=other' },
    })
    expect(otherBrowser!.headers.get('location')).toBe('/entrar?recusa=expirou')
    const first = await request(callback, { headers: { cookie: browser } })
    expect(first!.headers.get('location')).toBe('/')
    const replay = await request(callback, { headers: { cookie: browser } })
    expect(replay!.headers.get('location')).toBe('/entrar?recusa=expirou')
  })

  it('treats a callback without a code as Google refusing', async () => {
    const { request } = setup()
    const start = (await request('/auth/google'))!
    const state = new URL(start.headers.get('location')!).searchParams.get(
      'state',
    )
    const browser = start.headers.get('set-cookie')!.split(';')[0]!
    const response = await request(
      `/auth/callback?state=${state}&error=access_denied`,
      { headers: { cookie: browser } },
    )
    expect(response!.headers.get('location')).toBe('/entrar?recusa=google')
  })

  it('stays off without the Google client, and nobody is logged in', async () => {
    const { request, owner } = setup({ configured: false })
    expect((await request('/auth/google'))!.headers.get('location')).toBe(
      '/entrar?recusa=indisponivel',
    )
    expect(
      (await request('/auth/callback?state=s&code=c'))!.headers.get('location'),
    ).toBe('/entrar?recusa=indisponivel')
    expect(owner('local-session=anything')).toBeNull()
  })

  it('answers only under /auth/', async () => {
    const { request } = setup()
    expect(await request('/')).toBeNull()
    expect((await request('/auth/nothing'))!.status).toBe(404)
  })
})

describe('the session', () => {
  it('ends when the Pessoa stops being Dono', async () => {
    const data = mkdtempSync(join(tmpdir(), 'data-'))
    cpSync(FIXTURE, data, { recursive: true })
    const { login, session, owner } = setup({ data })
    const cookie = session((await login())!)
    expect(owner(cookie)?.person).toBe('bruno')

    writeFileSync(
      join(data, 'people/bruno.md'),
      '---\nname: Bruno\nemail: bruno@example.org\n---\n',
    )
    expect(owner(cookie)).toBeNull()
  })

  it('replaces the previous session on a new login', async () => {
    const { login, session, owner } = setup()
    const first = session((await login())!)!
    const second = session((await login(first))!)
    expect(owner(second)?.person).toBe('bruno')
    expect(owner(first)).toBeNull()
  })

  it('logs out only from this site', async () => {
    const { login, session, owner, request } = setup()
    const cookie = session((await login())!)!
    const elsewhere = await request('/auth/logout', {
      method: 'POST',
      headers: { cookie, origin: 'https://evil.test' },
    })
    expect(elsewhere!.status).toBe(403)
    expect(owner(cookie)).not.toBeNull()

    const response = await request('/auth/logout', {
      method: 'POST',
      headers: { cookie, origin: ORIGIN },
    })
    expect(response!.headers.get('location')).toBe('/entrar')
    expect(response!.headers.get('set-cookie')).toMatch(
      /^local-session=; .*Max-Age=0/,
    )
    expect(owner(cookie)).toBeNull()
  })

  it('is no one without a cookie or with an unknown one', () => {
    const { owner } = setup()
    expect(owner()).toBeNull()
    expect(owner('local-session=unknown')).toBeNull()
  })
})

describe('on https', () => {
  it('uses __Host- cookies with Secure', async () => {
    const auth = new Auth({
      origin: 'https://cinema.example',
      clientId: 'client',
      clientSecret: 'secret',
      databasePath: join(mkdtempSync(join(tmpdir(), 'auth-')), 'auth.sqlite'),
      owners: ownersFromDataRepo(FIXTURE),
    })
    const response = await auth.handle(
      new Request('https://cinema.example/auth/google'),
    )
    expect(response!.headers.get('location')).toMatch(
      /^https:\/\/accounts\.google\.com\//,
    )
    expect(response!.headers.get('set-cookie')).toMatch(
      /^__Host-google=.+; Secure$/,
    )
  })

  it('refuses a plain-http origin that is not local', async () => {
    const auth = new Auth({
      origin: 'http://cinema.example',
      clientId: 'client',
      clientSecret: 'secret',
      databasePath: join(mkdtempSync(join(tmpdir(), 'auth-')), 'auth.sqlite'),
      owners: ownersFromDataRepo(FIXTURE),
    })
    const response = await auth.handle(
      new Request('http://cinema.example/auth/google'),
    )
    expect(response!.headers.get('location')).toBe(
      '/entrar?recusa=indisponivel',
    )
  })
})

describe('from the environment', () => {
  const env = (origin: string) => ({
    APP_ORIGIN: origin,
    GOOGLE_CLIENT_ID: 'client',
    GOOGLE_CLIENT_SECRET: 'secret',
    GOOGLE_STUB_ORIGIN: 'http://localhost:9999',
    AUTH_DATABASE_PATH: join(
      mkdtempSync(join(tmpdir(), 'auth-')),
      'auth.sqlite',
    ),
    DATA_REPO_PATH: FIXTURE,
  })
  const googleTarget = async (origin: string) => {
    const response = await authFromEnvironment(env(origin)).handle(
      new Request(`${origin}/auth/google`),
    )
    return new URL(response!.headers.get('location')!).origin
  }

  it('sends the e2e to the stand-in Google on a local origin', async () => {
    expect(await googleTarget('http://localhost:3000')).toBe(
      'http://localhost:9999',
    )
  })

  it('ignores the stand-in on a real origin', async () => {
    expect(await googleTarget('https://cinema.example')).toBe(
      'https://accounts.google.com',
    )
  })

  it('keeps login off and the volume paths by default', () => {
    expect(serverEnv({})).toMatchObject({
      APP_ORIGIN: undefined,
      AUTH_DATABASE_PATH: '/data/auth.sqlite',
      DATA_REPO_PATH: '/data/filmes-dados',
    })
  })
})
