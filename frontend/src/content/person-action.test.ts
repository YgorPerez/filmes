// Where a Pessoa page's post comes back to (#273) and what its query keeps:
// the ficha that posted, the refused field, the notice and the refusal.
import { describe, expect, it } from 'vite-plus/test'
import {
  isPeopleNotice,
  isPeopleRefusal,
  personSearch,
  problemParam,
  readProblemParam,
  sectionOfSpot,
  spotOf,
} from './person-action'

const form = (fields: Record<string, string>) => {
  const data = new FormData()
  for (const [name, value] of Object.entries(fields)) data.set(name, value)
  return data
}

describe('spotOf', () => {
  it.each([
    [{ acao: 'declarar' }, 'declarados'],
    [{ acao: 'ajustar', elo: 'director' }, 'ajuste-director'],
    [{ acao: 'ajustar', elo: 'cor' }, 'ajustes'],
    [{ acao: 'remover', tipo: 'seen' }, 'vistos'],
    [{ acao: 'remover', tipo: 'report' }, 'relatos'],
    [{ acao: 'remover' }, 'vetos'],
    [{ acao: 'remover-pessoa' }, 'remover-pessoa'],
    [{ acao: 'outra' }, undefined],
    [{}, undefined],
  ])('sends %o back to %s', (fields, spot) => {
    expect(spotOf(form(fields))).toBe(spot)
  })

  it('puts an Ajuste’s row in Ajustes', () => {
    expect(sectionOfSpot('ajuste-cast')).toBe('ajustes')
    expect(sectionOfSpot('vetos')).toBe('vetos')
  })
})

describe('the refused field in the query', () => {
  it('reads back what it wrote', () => {
    const param = problemParam({ field: 'alvo', problem: 'target' })
    expect(param).toBe('alvo:target')
    expect(readProblemParam(param)).toEqual({
      field: 'alvo',
      problem: 'target',
    })
  })

  it.each([undefined, 3, 'alvo', 'alvo:outro', 'Alvo:target', ':target'])(
    'takes %o for no field',
    (value) => {
      expect(readProblemParam(value)).toBeUndefined()
    },
  )
})

describe('personSearch', () => {
  it('keeps what the last form did, where and which field', () => {
    expect(
      personSearch({
        feito: 'gravado',
        erro: 'pedido',
        em: 'ajuste-cast',
        campo: 'texto:required',
      }),
    ).toEqual({
      feito: 'gravado',
      erro: 'pedido',
      em: 'ajuste-cast',
      campo: 'texto:required',
    })
  })

  it('drops what it does not know', () => {
    expect(
      personSearch({ feito: 'x', erro: 'y', em: 'Vetos!', campo: 'texto:z' }),
    ).toEqual({
      feito: undefined,
      erro: undefined,
      em: undefined,
      campo: undefined,
    })
    expect(personSearch({ em: 7 }).em).toBeUndefined()
  })
})

describe('the Pessoas list query', () => {
  it('knows its refusals and its one notice', () => {
    expect(isPeopleRefusal('pessoa')).toBe(true)
    expect(isPeopleRefusal('baixar')).toBe(true)
    expect(isPeopleRefusal('outra')).toBe(false)
    expect(isPeopleNotice('removida')).toBe(true)
    expect(isPeopleNotice('gravado')).toBe(false)
  })
})
