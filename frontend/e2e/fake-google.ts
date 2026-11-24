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
import { createServer } from 'node:http'

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

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost')
  const send = (status: number, body: string, type = 'application/json') => {
    response.writeHead(status, { 'content-type': type })
    response.end(body)
  }
  if (url.pathname === '/authorize') {
    const challengeOk = url.searchParams.get('code_challenge_method') === 'S256'
    const scopeOk = url.searchParams.get('scope') === 'openid email'
    if (!challengeOk || !scopeOk) return send(400, 'bad request', 'text/plain')
    return send(200, chooser(url.searchParams), 'text/html; charset=utf-8')
  }
  if (url.pathname === '/choose') {
    const code = randomBytes(16).toString('hex')
    grants.set(code, {
      email: url.searchParams.get('email') ?? '',
      challenge: url.searchParams.get('code_challenge') ?? '',
    })
    const back = new URL(url.searchParams.get('redirect_uri') ?? '')
    back.searchParams.set('code', code)
    back.searchParams.set('state', url.searchParams.get('state') ?? '')
    response.writeHead(303, { location: back.href })
    return response.end()
  }
  if (url.pathname === '/token' && request.method === 'POST') {
    let body = ''
    for await (const chunk of request) body += String(chunk)
    const form = new URLSearchParams(body)
    const grant = grants.get(form.get('code') ?? '')
    grants.delete(form.get('code') ?? '')
    const challenge = createHash('sha256')
      .update(form.get('code_verifier') ?? '')
      .digest('base64url')
    if (!grant || grant.challenge !== challenge)
      return send(400, JSON.stringify({ error: 'invalid_grant' }))
    const token = randomBytes(16).toString('hex')
    tokens.set(token, grant.email)
    return send(200, JSON.stringify({ access_token: token }))
  }
  if (url.pathname === '/userinfo') {
    const token = request.headers.authorization?.replace(/^Bearer /, '') ?? ''
    const email = tokens.get(token)
    if (email === undefined) return send(401, '{}')
    return send(
      200,
      JSON.stringify({ sub: email, email, email_verified: true }),
    )
  }
  if (url.pathname === '/') return send(200, 'ok', 'text/plain')
  return send(404, 'not found', 'text/plain')
})

server.listen(Number(process.env.PORT ?? 4513), 'localhost')
