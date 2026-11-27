import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vite-plus/test'
import { LOGIN_REFUSALS } from '#/content/login-refusal'
import { LOGIN } from './login.copy'
import { Login, TraktScreen } from './login'

describe('Login', () => {
  it('leads to the Google login with no refusal shown', () => {
    const html = renderToStaticMarkup(<Login />)
    expect(html).toMatch(/<a href="\/auth\/google"[^>]*>Entrar com Google<\/a>/)
    expect(html).not.toContain('role="alert"')
  })

  it.each(LOGIN_REFUSALS)('says why it refused: %s', (refusal) => {
    const html = renderToStaticMarkup(<Login refusal={refusal} />)
    expect(html).toContain('role="alert"')
    expect(html).toContain(LOGIN.refusals[refusal])
  })

  it('does not send the visitor back to Google when sign-in is unavailable', () => {
    expect(
      renderToStaticMarkup(<Login refusal="indisponivel" />),
    ).not.toContain('href="/auth/google"')
  })

  it('opens with the brand on the case-black bar', () => {
    expect(renderToStaticMarkup(<Login />)).toMatch(
      /<header class="bg-case"><p[^>]*>filmes<\/p><\/header>/u,
    )
  })

  it('links the credits from its footer, for a visitor', () => {
    const html = renderToStaticMarkup(<Login />)
    expect(html).toMatch(
      /<footer[^>]*>.*<a href="\/creditos"[^>]*>Créditos das fontes<\/a>.*<\/footer>/,
    )
  })
})

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
  it('links the credits from its footer too', () => {
    expect(
      renderToStaticMarkup(<TraktScreen page={{ status: 'login' }} />),
    ).toMatch(
      /<footer[^>]*>.*<a href="\/creditos"[^>]*>Créditos das fontes<\/a>.*<\/footer>/,
    )
  })
})
