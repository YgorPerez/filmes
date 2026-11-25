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

  it('leads to the Export', () => {
    expect(renderToStaticMarkup(<Home name="Bruno" />)).toMatch(
      /<a href="\/exportar"[^>]*>Exportar Notas<\/a>/,
    )
  })
})

describe('Home, Pessoas', () => {
  it('leads to the Pessoas', () => {
    expect(renderToStaticMarkup(<Home name="Bruno" />)).toMatch(
      /<a href="\/pessoas"[^>]*>Pessoas<\/a>/,
    )
  })
})

describe('Home, Imports', () => {
  it('leads to the Imports', () => {
    expect(renderToStaticMarkup(<Home name="Bruno" />)).toMatch(
      /<a href="\/importar"[^>]*>Importar<\/a>/,
    )
  })
})
