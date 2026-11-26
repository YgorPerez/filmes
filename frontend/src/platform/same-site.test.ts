import { describe, expect, it } from 'vite-plus/test'
import { fromThisSite } from './same-site'

const ORIGIN = 'https://cinema.example'
const from = (headers: Record<string, string>) =>
  new Request(`${ORIGIN}/participar/votos`, { method: 'POST', headers })

describe('fromThisSite', () => {
  it("takes the link's no-referrer form, told apart by Sec-Fetch-Site", () => {
    expect(
      fromThisSite(
        from({ origin: 'null', 'sec-fetch-site': 'same-origin' }),
        ORIGIN,
      ),
    ).toBe(true)
    expect(
      fromThisSite(
        from({ origin: 'null', 'sec-fetch-site': 'cross-site' }),
        ORIGIN,
      ),
    ).toBe(false)
    expect(
      fromThisSite(
        from({ origin: ORIGIN, 'sec-fetch-site': 'same-site' }),
        ORIGIN,
      ),
    ).toBe(false)
  })

  it('falls back to the Origin without Fetch Metadata', () => {
    expect(fromThisSite(from({ origin: ORIGIN }), ORIGIN)).toBe(true)
    expect(fromThisSite(from({ origin: 'null' }), ORIGIN)).toBe(false)
    expect(
      fromThisSite(from({ origin: 'https://elsewhere.example' }), ORIGIN),
    ).toBe(false)
    expect(fromThisSite(from({}), ORIGIN)).toBe(false)
    expect(fromThisSite(from({ origin: ORIGIN }), undefined)).toBe(false)
  })
})
