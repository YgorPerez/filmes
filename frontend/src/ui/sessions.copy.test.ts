// The words the Sessões pages build: how many films, a reading's item as a
// person says it, the shelf by title, the group on the bar.
import { describe, expect, it } from 'vite-plus/test'
import { SESSIONS, spoken } from './sessions.copy'

describe('the Sessões copy', () => {
  it('counts films', () => {
    expect(SESSIONS.films(0)).toBe('nenhum filme')
    expect(SESSIONS.films(1)).toBe('1 filme')
    expect(SESSIONS.films(4)).toBe('4 filmes')
  })

  it('says a reading’s item as a person does', () => {
    expect(spoken('Presente: Bruno', 'Bruno')).toBe('você')
    expect(spoken('Presente: Iara', 'Bruno')).toBe('Iara')
    expect(spoken('Clima: leve')).toBe('leve')
  })

  it('names the shelf by its first titles', () => {
    expect(SESSIONS.list.shelf(['Cais', 'Fronteira'], 0)).toBe(
      'Cais · Fronteira',
    )
    expect(SESSIONS.list.shelf(['Cais', 'Fronteira', 'Sal'], 2)).toBe(
      'Cais · Fronteira · Sal e mais 2',
    )
  })

  it('names the rest of a told shelf', () => {
    expect(SESSIONS.session.others(1)).toBe('O outro filme da prateleira')
    expect(SESSIONS.session.others(3)).toBe('Os outros 3 da prateleira')
  })

  it('names the group on the bar, in words up to six', () => {
    expect(SESSIONS.form.together(2)).toBe('vocês dois')
    expect(SESSIONS.form.together(9)).toBe('vocês 9')
  })
})
