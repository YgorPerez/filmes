// The host's Nginx checked by the declared format, modeled on
// pesquisa-relacionamentos' `nginx.test.ts`: the access_log never carries
// the query, the error_log rotates daily keeping 3, and nothing here takes a
// request meant for the other sites on the shared VPS (ADR 0006).

import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vite-plus/test'
import { HOST_CONFIG } from '../scripts/deploy-plan.ts'
import { MAX_UPLOAD_BYTES } from '../src/content/import-action.ts'

const folder = new URL('./', import.meta.url)
const read = (name: string) => readFileSync(new URL(name, folder), 'utf8')
const vhost = read('filmes.conf')
const tls = read('tls.conf')
const logFormat = read('log-without-query.conf')
const rotation = read('logrotate-filmes')

type Directive = { name: string; args: string[]; children?: Directive[] }

/** Enough of Nginx's grammar for the vhost: `name args;` directives,
 * `name args { … }` blocks, `#` comments and single or double quotes. */
function parse(text: string): Directive[] {
  const tokens = text.match(/'[^']*'|"[^"]*"|#[^\n]*|[{};]|[^\s{};'"#]+/g) ?? []
  let i = 0
  const block = (): Directive[] => {
    const directives: Directive[] = []
    let current: string[] = []
    while (i < tokens.length) {
      const t = tokens[i++]
      if (t.startsWith('#')) continue
      if (t === ';') {
        directives.push({ name: current[0], args: current.slice(1) })
        current = []
      } else if (t === '{') {
        directives.push({
          name: current[0],
          args: current.slice(1),
          children: block(),
        })
        current = []
      } else if (t === '}') return directives
      else current.push(t.replace(/^(['"])(.*)\1$/s, '$2'))
    }
    return directives
  }
  return block()
}

const top = parse(vhost)
const ofLog = parse(logFormat)
const servers = top.filter((d) => d.name === 'server')
const named = (block: Directive[] | undefined, name: string) =>
  (block ?? []).filter((d) => d.name === name)
const all = (block: Directive[]): Directive[] =>
  block.flatMap((d) => [d, ...(d.children ? all(d.children) : [])])

// Everything that copies the query, or the whole address the visitor came
// from.
const VARIABLES_WITH_QUERY =
  /\$(request|request_uri|args|query_string|is_args|arg_\w+|http_referer|request_body|uri_with_args)\b/

describe('the access_log format', () => {
  test('is a single log_format, which carries neither the query nor the Referer', () => {
    const formats = named(ofLog, 'log_format')
    expect(formats.map((f) => f.args[0])).toEqual(['filmes_without_query'])
    const format = formats[0].args.slice(1).join(' ')
    expect(format).toContain('$request_method')
    expect(format).toContain('$status')
    expect(format).toContain('$filmes_path')
    expect(format).not.toMatch(VARIABLES_WITH_QUERY)
  })

  test("the log's path is the request cut before the first ?", () => {
    const [map] = named(ofLog, 'map')
    expect(map.args).toEqual(['$request_uri', '$filmes_path'])
    const [rule] = (map.children ?? []).filter((d) => d.name.startsWith('~'))
    const regex = new RegExp(rule.name.slice(1))
    const capture = rule.args[0].slice(1)
    const path = (uri: string) => uri.match(regex)?.groups?.[capture]
    expect(path('/oauth/callback?code=abc&state=x')).toBe('/oauth/callback')
    expect(path('/?q=terror')).toBe('/')
    expect(path('/sessoes')).toBe('/sessoes')
  })
})

describe('the cinema.temestudo.cloud vhost', () => {
  test('only serves cinema.temestudo.cloud, on 80 and 443', () => {
    expect(
      servers.map((s) =>
        named(s.children, 'server_name').flatMap((n) => n.args),
      ),
    ).toEqual([['cinema.temestudo.cloud'], ['cinema.temestudo.cloud']])
  })

  test("never takes the shared VPS's default_server", () => {
    const listens = all(top).filter((d) => d.name === 'listen')
    expect(listens.length).toBeGreaterThan(0)
    for (const listen of listens)
      expect(listen.args).not.toContain('default_server')
  })

  test("each server writes in the no-query format and to the site's error_log", () => {
    expect(named(top, 'log_format')).toEqual([])
    for (const server of servers) {
      expect(named(server.children, 'access_log').map((d) => d.args)).toEqual([
        ['/var/log/nginx/filmes/access.log', 'filmes_without_query'],
      ])
      expect(named(server.children, 'error_log').map((d) => d.args[0])).toEqual(
        ['/var/log/nginx/filmes/error.log'],
      )
    }
    for (const d of all(top).filter((d) => d.name === 'access_log'))
      expect(d.args[1]).toBe('filmes_without_query')
  })
})

describe('the cinema.temestudo.cloud vhost, its two servers', () => {
  test("80 serves certbot's challenge from /opt/filmes/acme and sends the rest to https", () => {
    const http = servers.find((s) =>
      named(s.children, 'listen').some((l) => l.args[0] === '80'),
    )
    const locations = named(http?.children, 'location')
    const acme = locations.find((l) =>
      l.args.includes('/.well-known/acme-challenge/'),
    )
    expect(named(acme?.children, 'root').map((d) => d.args)).toEqual([
      ['/opt/filmes/acme'],
    ])
    const rest = locations.find((l) => l.args.join(' ') === '/')
    expect(named(rest?.children, 'return').map((d) => d.args)).toEqual([
      ['301', 'https://cinema.temestudo.cloud$request_uri'],
    ])
  })

  test('443 passes to the container through the include the deploy writes, with its own TLS', () => {
    const https = servers.find((s) =>
      named(s.children, 'listen').some((l) => l.args.includes('ssl')),
    )
    expect(named(https?.children, 'include').map((d) => d.args[0])).toEqual([
      '/etc/nginx/filmes/tls.conf',
    ])
    const location = named(https?.children, 'location')[0]
    expect(named(location.children, 'include').map((d) => d.args[0])).toEqual([
      '/etc/nginx/filmes/filmes-app.conf',
    ])
    const tlsDirectives = parse(tls)
    expect(
      named(tlsDirectives, 'ssl_session_cache').map((d) => d.args),
    ).toEqual([['shared:filmes_tls:10m']])
    expect(
      named(tlsDirectives, 'ssl_certificate').map((d) => d.args[0]),
    ).toEqual(['/etc/letsencrypt/live/cinema.temestudo.cloud/fullchain.pem'])
  })
})

describe('the cinema.temestudo.cloud vhost, its uploads and files', () => {
  test('lets an Imports upload through, up to a bit more than the app takes', () => {
    const https = servers.find((s) =>
      named(s.children, 'listen').some((l) => l.args.includes('ssl')),
    )
    const [size] = named(https?.children, 'client_max_body_size')
    const megabytes = Number(size?.args[0]?.replace(/m$/, ''))
    expect(megabytes * 1024 * 1024).toBeGreaterThan(MAX_UPLOAD_BYTES)
  })

  test('the deploy installs every file here, each under a filmes name', () => {
    expect(HOST_CONFIG.map(([name]) => name).sort()).toEqual([
      'filmes.conf',
      'log-without-query.conf',
      'logrotate-filmes',
      'tls.conf',
    ])
    for (const [, target] of HOST_CONFIG) expect(target).toMatch(/filmes/)
  })
})

describe("the site's log rotation", () => {
  const stanzas = [...rotation.matchAll(/^([^\s#][^{]*)\{([^}]*)\}/gm)].map(
    (m) => ({
      files: m[1].trim().split(/\s+/),
      rules: m[2]
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#')),
    }),
  )

  test('the error_log rotates daily and never exceeds 3 days, counting the current file', () => {
    const error = stanzas.find((e) =>
      e.files.includes('/var/log/nginx/filmes/error.log'),
    )
    expect(error?.rules).toContain('daily')
    const rotate = Number(
      error?.rules.find((r) => r.startsWith('rotate '))?.split(' ')[1],
    )
    // Today's `error.log` plus `rotate` rotated files, one per day.
    expect(1 + rotate).toBe(3)
    expect(error?.rules.some((r) => r.startsWith('postrotate'))).toBe(true)
  })
})
