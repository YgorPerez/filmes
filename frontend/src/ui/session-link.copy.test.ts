// The Link da Sessão's words that change with the Session: the preview in
// a chat, the invitation, the lead and the Votar button.
import { describe, expect, it } from 'vite-plus/test'
import { PARTICIPATION } from './session-link.copy'

describe('the Link da Sessão copy', () => {
  it('previews who calls and with whom', () => {
    expect(PARTICIPATION.preview('Bruno', ['Bruno', 'Iara', 'Quim'])).toEqual({
      title: 'Bruno chamou você pra escolher o filme',
      description:
        'Escolha o filme com Bruno, Iara e Quim. Sem login: é só tocar no seu nome.',
    })
    expect(PARTICIPATION.preview(null, ['Iara'])).toEqual({
      title: 'Escolha o filme da noite',
      description:
        'Escolha o filme com Iara. Sem login: é só tocar no seu nome.',
    })
    expect(PARTICIPATION.preview(null, []).description).toBe(
      'Escolha o filme com . Sem login: é só tocar no seu nome.',
    )
  })

  it('counts the films and the newcomers', () => {
    expect(PARTICIPATION.lead(1)).toBe(
      'O filme que o filmes separou pra noite.',
    )
    expect(PARTICIPATION.lead(5)).toMatch(/^Os 5 que/u)
    expect(PARTICIPATION.voteNew(1)).toBe('Votar no que chegou')
    expect(PARTICIPATION.voteNew(2)).toBe('Votar nos 2 que chegaram')
  })

  it('names who sent the link, or says it plainly', () => {
    expect(PARTICIPATION.who('Bruno')).toBe('Bruno')
    expect(PARTICIPATION.who(null)).toBe('quem te mandou o link')
    expect(PARTICIPATION.questionsLead(null)).toMatch(/Quem abriu a Sessão vê/u)
    expect(PARTICIPATION.invited(null, 'sexta')).toBe(
      'Escolha o filme da noite · sexta',
    )
  })
})
