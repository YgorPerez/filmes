import { describe, expect, test } from 'vite-plus/test'
import { withRequestLog } from './request-log'

function setup(response: () => Response | Promise<Response>) {
  const lines: string[] = []
  let clock = 1000
  const fetch = withRequestLog(async () => response(), {
    write: (line) => lines.push(line),
    now: () => (clock += 12),
  })
  return { fetch, lines }
}

describe("the server's log of each request", () => {
  test('keeps only method, path, status and time', async () => {
    const { fetch, lines } = setup(() => new Response('ok', { status: 200 }))

    await fetch(
      new Request(
        'https://cinema.temestudo.cloud/oauth/callback?code=s3cr3t&state=xyz#top',
      ),
    )

    expect(lines).toEqual(['GET /oauth/callback 200 12ms'])
    expect(lines.join('\n')).not.toMatch(/s3cr3t|xyz|[?&=#]/)
  })

  test('leaves out the body, the cookies, the e-mail and the IP', async () => {
    const { fetch, lines } = setup(() => new Response('{}', { status: 201 }))

    await fetch(
      new Request('https://cinema.temestudo.cloud/_serverFn/abc?x=1', {
        method: 'POST',
        headers: {
          'x-forwarded-for': '203.0.113.7',
          cookie: 'session=abc',
        },
        body: JSON.stringify({ email: 'ana@example.com' }),
      }),
    )

    expect(lines).toEqual(['POST /_serverFn/abc 201 12ms'])
  })

  test('the response goes on as it came', async () => {
    const { fetch } = setup(
      () => new Response('ok', { headers: { 'content-type': 'text/html' } }),
    )

    const response = await fetch(
      new Request('https://cinema.temestudo.cloud/'),
    )

    expect(response.headers.get('content-type')).toBe('text/html')
    expect(await response.text()).toBe('ok')
  })

  test('a request that blows up on the server becomes a line with status 500', async () => {
    const { fetch, lines } = setup(() => {
      throw new Error('broke')
    })

    await expect(
      fetch(new Request('https://cinema.temestudo.cloud/x?y=1')),
    ).rejects.toThrow('broke')
    expect(lines).toEqual(['GET /x 500 12ms'])
  })
})
