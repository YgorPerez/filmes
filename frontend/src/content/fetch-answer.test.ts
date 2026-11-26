// How a form route answers a post by `fetch` (#235): the 303's location as
// `{ to }`, and anything else as it was.
import { describe, expect, it } from 'vite-plus/test'
import { answerFetch, FETCH_HEADER } from './fetch-answer'

/** The 303 a form route answers with (`seeOther`). */
const seeOther = (location: string) =>
  new Response(null, { status: 303, headers: { Location: location } })

const post = (headers: Record<string, string> = {}) =>
  new Request('http://localhost/sessoes/nova/enviar', {
    method: 'POST',
    headers,
  })

describe('answerFetch', () => {
  it('answers a post by fetch with where the 303 goes', async () => {
    const answer = answerFetch(
      post({ [FETCH_HEADER]: '1' }),
      seeOther('/sessoes/nova?erro=presentes'),
    )
    expect(answer.status).toBe(200)
    expect(answer.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await answer.json()).toEqual({ to: '/sessoes/nova?erro=presentes' })
  })

  it("keeps the 303's other headers, as a cookie it sets", () => {
    const back = seeOther('/entrar')
    back.headers.append('Set-Cookie', 'a=1; Path=/')
    back.headers.append('Set-Cookie', 'b=2; Path=/')
    back.headers.set('Content-Length', '0')
    const answer = answerFetch(post({ [FETCH_HEADER]: '1' }), back)
    expect(answer.headers.getSetCookie()).toEqual([
      'a=1; Path=/',
      'b=2; Path=/',
    ])
    expect(answer.headers.get('Location')).toBeNull()
    expect(answer.headers.get('Content-Length')).not.toBe('0')
    expect(answer.headers.get('Content-Type')).toBe('application/json')
  })

  it('leaves a plain post, and any answer but a 303, as they were', () => {
    const back = seeOther('/sessoes/nova')
    expect(answerFetch(post(), back)).toBe(back)
    const refused = new Response('Origem recusada', { status: 403 })
    expect(answerFetch(post({ [FETCH_HEADER]: '1' }), refused)).toBe(refused)
  })
})
