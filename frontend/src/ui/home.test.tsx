import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vite-plus/test'
import { Home } from './home'

describe('Home', () => {
  it('greets the Dono by name and lets her log out with a POST', () => {
    const html = renderToStaticMarkup(<Home name="Bruno" admin={false} />)
    expect(html).toContain('Olá, Bruno')
    expect(html).toMatch(
      /<form action="\/auth\/logout" method="post"><button type="submit"[^>]*>Sair/,
    )
  })

  it('leads to the Export', () => {
    expect(renderToStaticMarkup(<Home name="Bruno" admin={false} />)).toMatch(
      /<a href="\/exportar"[^>]*>Exportar Notas<\/a>/,
    )
  })
})

describe('Home, Pessoas', () => {
  it('leads to the Pessoas', () => {
    expect(renderToStaticMarkup(<Home name="Bruno" admin={false} />)).toMatch(
      /<a href="\/pessoas"[^>]*>Pessoas<\/a>/,
    )
  })
})

describe('Home, Feedback', () => {
  it('leads to the open Sessions’ Feedback', () => {
    expect(renderToStaticMarkup(<Home name="Bruno" admin={false} />)).toMatch(
      /<a href="\/feedback"[^>]*>Feedback<\/a>/,
    )
  })
})

describe('Home, Imports', () => {
  it('leads to the Imports', () => {
    expect(renderToStaticMarkup(<Home name="Bruno" admin={false} />)).toMatch(
      /<a href="\/importar"[^>]*>Importar<\/a>/,
    )
  })
})

describe('Home, Operações', () => {
  it('leads an admin to Operações, and no one else', () => {
    expect(renderToStaticMarkup(<Home name="Bruno" admin />)).toMatch(
      /<a href="\/operacoes"[^>]*>Operações<\/a>/,
    )
    expect(
      renderToStaticMarkup(<Home name="Bruno" admin={false} />),
    ).not.toContain('/operacoes')
  })
})
