// The words a Pessoa page builds: the Nota on 1 to 10, its source, what a
// field lacks, the fold of the empty fichas.
import { describe, expect, it } from 'vite-plus/test'
import { PERSON } from './person.copy'

describe('the Pessoa copy', () => {
  it('writes a Nota on the 1 to 10 scale', () => {
    expect(PERSON.ratingText(4.5)).toBe('nota 9')
    expect(PERSON.ratingText(3.75)).toBe('nota 7,5')
  })

  it('says the stars of a source that rates on 5', () => {
    expect(PERSON.ratingSource(4.5, 'Letterboxd da Iara')).toBe(
      '4,5★ no Letterboxd da Iara',
    )
    expect(PERSON.ratingSource(4, 'notas no site')).toBe('notas no site')
    expect(PERSON.ratingSource(4, null)).toBeNull()
  })

  it.each([
    ['nota', 'rating', 'A Nota vai de 1 a 10.'],
    ['filme', 'film', /^Falta o filme: busque pelo título/],
    ['nota', 'film', 'O filme é o tt… dele no Catálogo.'],
    ['alvo', 'id', /^Busque pelo nome/],
    ['alvo', 'target', /^Falta o alvo/],
    ['alvo', 'reaction', /^Uma reação precisa de um alvo/],
    ['texto', 'required', 'Falta o texto: o que foi dito.'],
    ['outro', 'required', 'Falta preencher este campo.'],
  ] as const)('says what %s lacks (%s)', (field, problem, text) => {
    expect(PERSON.fieldProblem({ field, problem })).toMatch(text)
  })

  it('names the empty fichas and her name in the Sessões', () => {
    expect(PERSON.empties(['Vetos'])).toBe('Ainda sem Vetos · Acrescentar')
    expect(PERSON.empties(['Vetos', 'Declarados', 'Já vistos'])).toBe(
      'Ainda sem Vetos, Declarados e Já vistos · Acrescentar',
    )
    expect(PERSON.refine(['Ajustes', 'Declarados (2)'])).toBe(
      'Afinar: Ajustes e Declarados (2)',
    )
    expect(PERSON.notices('Quim').gravado).toBe('Gravado no arquivo de Quim.')
    expect(PERSON.sessions.reaction(null)).toBe('sem reação')
    expect(PERSON.sessions.reaction(0.2)).toBe('não gostou')
    expect(PERSON.ownName('Bruno', [])).toBe('Nas Sessões, você é Bruno.')
    expect(PERSON.glance.notes(1)).toBe('1 Nota')
    expect(PERSON.glance.notes(1200)).toBe('1.200 Notas')
    expect(PERSON.plainLabel('tag: chuva')).toBe('a tag “chuva”')
  })
})
