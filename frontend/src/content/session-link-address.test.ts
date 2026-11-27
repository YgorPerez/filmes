// The Link da Sessão's addresses: where its child pages go back to, the
// page a link asked for, and where a name on its first screen leads.
import { describe, expect, it } from 'vite-plus/test'
import {
  askedLinkPage,
  pickedLinkPath,
  sessionLinkHome,
} from './session-link-address'

describe('the Link da Sessão address', () => {
  it('goes back to the film list only with the Session and its key', () => {
    expect(sessionLinkHome({ sessao: 's', chave: 'k', presente: 'iara' })).toBe(
      '/participar?sessao=s&chave=k&presente=iara',
    )
    expect(
      sessionLinkHome({ sessao: 's', chave: undefined, presente: undefined }),
    ).toBeNull()
    expect(
      sessionLinkHome({ sessao: undefined, chave: 'k', presente: undefined }),
    ).toBeNull()
  })

  it('keeps a child page the link asked for, else the names', () => {
    expect(askedLinkPage('/participar/votar/')).toBe('/participar/votar')
    expect(askedLinkPage('/participar/perguntas')).toBe('/participar/perguntas')
    expect(askedLinkPage('/participar/outra')).toBe('/participar')
    expect(askedLinkPage('/participar')).toBe('/participar')
  })

  it('leads a name to the asked page as that Presente', () => {
    expect(pickedLinkPath('s', 'k', 'quim', '/participar/votar')).toBe(
      '/participar/votar?sessao=s&chave=k&presente=quim',
    )
  })
})
