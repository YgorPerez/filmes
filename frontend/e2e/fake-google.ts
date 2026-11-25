// A stand-in for Google's OAuth, for the e2e: the app reaches it through
// `GOOGLE_STUB_ORIGIN` (`platform/auth.ts`, honoured only on a local origin).
// Its account chooser is a form where the test types the email; the code it
// gives back only trades for a token with the right PKCE verifier, so the
// e2e also checks the app's S256.
//
//   PORT=4513 node e2e/fake-google.ts
//
// Plain `node`: only syntax it strips.

import { createHash, randomBytes } from 'node:crypto'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'

type Grant = { email: string; challenge: string }

const grants = new Map<string, Grant>()
const tokens = new Map<string, string>()

const escape = (text: string) =>
  text.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!,
  )

function chooser(params: URLSearchParams) {
  const hidden = ['redirect_uri', 'state', 'code_challenge']
    .map(
      (name) =>
        `<input type="hidden" name="${name}" value="${escape(params.get(name) ?? '')}">`,
    )
    .join('')
  return `<!doctype html><meta charset="utf-8"><title>Google (falso)</title>
<form method="get" action="/choose">${hidden}
<label>E-mail <input name="email" type="email"></label>
<button>Continuar</button></form>`
}

type Reply = { status: number; body: string; type?: string; location?: string }

const json = (status: number, value: unknown): Reply => ({
  status,
  body: JSON.stringify(value),
})
const text = (status: number, body: string): Reply => ({
  status,
  body,
  type: 'text/plain',
})

/** The account chooser, for the app's authorization request. */
function authorize(params: URLSearchParams): Reply {
  const challengeOk = params.get('code_challenge_method') === 'S256'
  const scopeOk = params.get('scope') === 'openid email'
  if (!challengeOk || !scopeOk) return text(400, 'bad request')
  return {
    status: 200,
    body: chooser(params),
    type: 'text/html; charset=utf-8',
  }
}

/** The email typed: a code for it, back to the app. */
function choose(params: URLSearchParams): Reply {
  const code = randomBytes(16).toString('hex')
  grants.set(code, {
    email: params.get('email') ?? '',
    challenge: params.get('code_challenge') ?? '',
  })
  const back = new URL(params.get('redirect_uri') ?? '')
  back.searchParams.set('code', code)
  back.searchParams.set('state', params.get('state') ?? '')
  return { status: 303, body: '', location: back.href }
}

/** The code for a token, only with the verifier of its challenge. */
async function token(request: IncomingMessage): Promise<Reply> {
  let body = ''
  for await (const chunk of request) body += String(chunk)
  const form = new URLSearchParams(body)
  const code = form.get('code') ?? ''
  const grant = grants.get(code)
  grants.delete(code)
  const challenge = createHash('sha256')
    .update(form.get('code_verifier') ?? '')
    .digest('base64url')
  if (!grant || grant.challenge !== challenge)
    return json(400, { error: 'invalid_grant' })
  const issued = randomBytes(16).toString('hex')
  tokens.set(issued, grant.email)
  return json(200, { access_token: issued })
}

function userinfo(request: IncomingMessage): Reply {
  const bearer = request.headers.authorization?.replace(/^Bearer /, '') ?? ''
  const email = tokens.get(bearer)
  if (email === undefined) return json(401, {})
  return json(200, { sub: email, email, email_verified: true })
}

async function route(request: IncomingMessage, url: URL): Promise<Reply> {
  switch (url.pathname) {
    case '/authorize':
      return authorize(url.searchParams)
    case '/choose':
      return choose(url.searchParams)
    case '/token':
      return request.method === 'POST' ? token(request) : text(404, 'not found')
    case '/userinfo':
      return userinfo(request)
    case '/':
      return text(200, 'ok')
    default:
      return text(404, 'not found')
  }
}

async function handle(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? '/', 'http://localhost')
  const reply = await route(request, url)
  response.writeHead(reply.status, {
    'content-type': reply.type ?? 'application/json',
    ...(reply.location ? { location: reply.location } : {}),
  })
  response.end(reply.body)
}

createServer((request, response) => void handle(request, response)).listen(
  Number(process.env.PORT ?? 4513),
  'localhost',
)
