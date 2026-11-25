// The self-hosted fonts at `/fonts/*`, as a browser and the Cartaz's MCP
// Apps view get them: the view lives in the host's sandbox, on another
// origin, so each answer must let any origin read it.

import { describe, expect, it } from 'vite-plus/test'
import { fontRequest } from './fonts'

const get = (path: string, method = 'GET') =>
  fontRequest(new Request(`https://cinema.example${path}`, { method }))

describe('the /fonts/ route', () => {
  it('serves each face as woff2 any origin can load, cached', async () => {
    for (const file of [
      'rubik-latin-500.woff2',
      'rubik-latin-700.woff2',
      'rubik-latin-800.woff2',
      'permanent-marker-latin-400.woff2',
    ]) {
      const response = get(`/fonts/${file}`)

      expect(response?.status).toBe(200)
      expect(response?.headers.get('content-type')).toBe('font/woff2')
      expect(response?.headers.get('access-control-allow-origin')).toBe('*')
      expect(response?.headers.get('cross-origin-resource-policy')).toBe(
        'cross-origin',
      )
      expect(response?.headers.get('cache-control')).toMatch(/public/u)
      const bytes = new Uint8Array(await response!.arrayBuffer())
      expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('wOF2')
    }
  })

  it('serves the stylesheet that declares them, pointing next to itself', async () => {
    const response = get('/fonts/fonts.css')
    const css = await response!.text()

    expect(response?.headers.get('content-type')).toBe(
      'text/css; charset=utf-8',
    )
    expect(response?.headers.get('access-control-allow-origin')).toBe('*')
    expect(css.match(/@font-face/gu)).toHaveLength(4)
    expect(css).toContain("font-family: 'Rubik'")
    expect(css).toContain("font-family: 'Permanent Marker'")
    expect(css).toContain("url('./rubik-latin-800.woff2') format('woff2')")
    expect(css.match(/font-display: swap/gu)).toHaveLength(4)
  })

  it('serves the licenses the fonts come with', async () => {
    const rubik = get('/fonts/rubik-OFL.txt')
    const marker = get('/fonts/permanent-marker-LICENSE.txt')

    expect(await rubik!.text()).toContain('SIL Open Font License')
    expect(await marker!.text()).toContain('Apache License')
    expect(rubik?.headers.get('content-type')).toBe('text/plain; charset=utf-8')
  })

  it('answers HEAD without a body', () => {
    const response = get('/fonts/rubik-latin-500.woff2', 'HEAD')

    expect(response?.status).toBe(200)
    expect(response?.body).toBeNull()
  })

  it('refuses what is not a font, and leaves other paths to the app', () => {
    expect(get('/fonts/antonio.woff2')?.status).toBe(404)
    expect(get('/fonts/fonts.css', 'POST')?.status).toBe(405)
    expect(get('/fontsx/fonts.css')).toBeNull()
    expect(get('/')).toBeNull()
  })
})
