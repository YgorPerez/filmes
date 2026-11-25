import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vite-plus/test'
import { LOGIN_REFUSALS } from '#/content/login-refusal'
import { LOGIN } from './login.copy'
import { Login } from './login'

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

  it('opens with the brand on the case-black bar', () => {
    expect(renderToStaticMarkup(<Login />)).toMatch(
      /<header class="bg-case"><p[^>]*>filmes<\/p><\/header>/u,
    )
  })
})
