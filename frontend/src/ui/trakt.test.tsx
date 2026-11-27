import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vite-plus/test'
import { TraktScreen } from './trakt'

describe('the Trakt connection screen', () => {
  it('says the connection is off, with nothing to submit', () => {
    const html = renderToStaticMarkup(
      <TraktScreen page={{ status: 'unavailable' }} />,
    )
    expect(html).toContain('A conexão com o Trakt está indisponível.')
    expect(html).not.toContain('<form')
    expect(html).not.toContain('role="alert"')
  })

  it('leads a visitor to the Google sign-in for Trakt', () => {
    expect(
      renderToStaticMarkup(<TraktScreen page={{ status: 'login' }} />),
    ).toMatch(/<a href="\/auth\/trakt-google"[^>]*>Entrar com Google<\/a>/)
  })

  it('asks for consent before connecting', () => {
    const html = renderToStaticMarkup(
      <TraktScreen page={{ status: 'disconnected', name: 'Iara' }} />,
    )
    expect(html).toContain('Iara')
    expect(html).toMatch(/<form[^>]* action="\/trakt\/conectar" method="post"/)
    expect(html).toMatch(
      /<input type="checkbox" required=""[^>]* name="consentir" value="sim"/,
    )
    expect(html).not.toContain('/trakt/desconectar')
  })

  it('lets a connected Pessoa disconnect', () => {
    const html = renderToStaticMarkup(
      <TraktScreen page={{ status: 'connected', name: 'Iara' }} />,
    )
    expect(html).toMatch(
      /<form[^>]* action="\/trakt\/desconectar" method="post"/,
    )
    expect(html).not.toContain('consentir')
  })

  it.each([
    ['login', 'Entre com o e-mail cadastrado no filmes.'],
    ['trakt', 'O Trakt não concluiu a conexão. Tente de novo.'],
    ['consentimento', 'Marque a caixa para autorizar o envio ao Trakt.'],
  ] as const)('says why it failed: %s', (error, message) => {
    const html = renderToStaticMarkup(
      <TraktScreen page={{ status: 'login' }} error={error} />,
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain(message)
  })
})
