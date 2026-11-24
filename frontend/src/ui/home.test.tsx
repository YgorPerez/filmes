import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vite-plus/test'
import { Home } from './home'

describe('Home', () => {
  it('greets the Dono by name and lets her log out with a POST', () => {
    const html = renderToStaticMarkup(<Home name="Bruno" />)
    expect(html).toContain('Olá, Bruno')
    expect(html).toMatch(
      /<form action="\/auth\/logout" method="post"><button type="submit"[^>]*>Sair/,
    )
  })
})
