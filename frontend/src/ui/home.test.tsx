import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vite-plus/test'
import { Home } from './home'

describe('Home', () => {
  it('names the app and says it is on its way online', () => {
    const html = renderToStaticMarkup(<Home />)
    expect(html).toContain('<h1>filmes</h1>')
    expect(html).toContain('Recomendador de filmes com evidência.')
  })
})
