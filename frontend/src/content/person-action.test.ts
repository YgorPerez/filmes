// The field a Pessoa's form would be refused for, which the page marks
// before the post (#268).
import { describe, expect, it } from 'vite-plus/test'
import { formProblem, parseAction } from './person-action'

const form = (fields: Record<string, string>) => {
  const data = new FormData()
  for (const [name, value] of Object.entries(fields)) data.set(name, value)
  return data
}

describe('formProblem', () => {
  it.each([
    [{ acao: 'declarar' }, { field: 'texto', problem: 'required' }],
    [
      { acao: 'relatar', texto: 'x', alvo: 'abc' },
      { field: 'alvo', problem: 'id' },
    ],
    [
      { acao: 'declarar', texto: 'x', reacao: 'love' },
      { field: 'alvo', problem: 'reaction' },
    ],
    [{ acao: 'visto' }, { field: 'filme', problem: 'required' }],
    [{ acao: 'visto', filme: 'Q1' }, { field: 'filme', problem: 'film' }],
    [
      { acao: 'visto', filme: 'tt1', nota: '11/10' },
      { field: 'nota', problem: 'rating' },
    ],
    [{ acao: 'vetar' }, { field: 'texto', problem: 'required' }],
    [{ acao: 'vetar', texto: 'x' }, { field: 'alvo', problem: 'target' }],
    [{ acao: 'vetar', texto: 'x', alvo: 'x1' }, { field: 'alvo', problem: 'id' }],
    [{ acao: 'responder' }, { field: 'texto', problem: 'required' }],
    [{ acao: 'dar-acesso' }, { field: 'email', problem: 'required' }],
  ])('marks %j', (fields, problem) => {
    expect(formProblem(form(fields))).toEqual(problem)
    expect(parseAction(form(fields))).toBeNull()
  })

  it.each([
    { acao: 'visto', filme: 'tt1', nota: '10/10' },
    { acao: 'visto', filme: 'tt1', nota: '4,5' },
    { acao: 'vetar', texto: 'x', grupo: 'slow' },
    { acao: 'vetar', texto: 'x', alvo: 'Q1' },
    { acao: 'declarar', texto: 'x', alvo: 'tt1', reacao: 'love' },
    { acao: 'responder', texto: 'sim', pergunta: 'p' },
    { acao: 'dar-acesso', email: 'a@b.c' },
    { acao: 'ajustar', elo: 'cast', nivel: 'low' },
    { acao: 'nada' },
  ])('passes %j', (fields) => {
    expect(formProblem(form(fields))).toBeNull()
  })
})
