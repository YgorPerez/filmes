// The argparse subset the argv adapter reads steps with.

import { describe, expect, test } from 'vite-plus/test'
import { ArgvError, parseArgv } from '../../oracle/adapter/argv.ts'

const RECOMMEND = {
  options: {
    presentes: { kind: 'list', required: true },
    regra: { kind: 'value', choices: ['padrao', 'media', 'de'] },
    clima: { kind: 'extend' },
    manter: { kind: 'list' },
    nota: { kind: 'append' },
    'sem-lento': { kind: 'flag' },
  },
} as const

describe('parseArgv', () => {
  test('reads values, lists, repeated options and flags as argparse does', () => {
    const args = parseArgv(
      [
        '--presentes',
        'dono',
        'iara',
        '--clima',
        'leve',
        '--regra=media',
        '--clima',
        'curto',
        'tenso',
        '--nota',
        'iara=4',
        '--nota',
        'bruno=-1',
        '--sem-lento',
      ],
      RECOMMEND,
    )

    expect(args).toEqual({
      presentes: ['dono', 'iara'],
      regra: 'media',
      clima: ['leve', 'curto', 'tenso'],
      manter: undefined,
      nota: ['iara=4', 'bruno=-1'],
      'sem-lento': true,
    })
  })

  test('defaults: flags false, append and extend empty, values undefined', () => {
    expect(parseArgv(['--presentes', 'dono'], RECOMMEND)).toEqual({
      presentes: ['dono'],
      regra: undefined,
      clima: [],
      manter: undefined,
      nota: [],
      'sem-lento': false,
    })
  })

  test('a unique prefix names its option; a negative number is a value', () => {
    const args = parseArgv(['--pres', 'dono', '--man', '-1', '-2.5'], RECOMMEND)

    expect(args.presentes).toEqual(['dono'])
    expect(args.manter).toEqual(['-1', '-2.5'])
  })

  test('positionals in order, optional ones, choices and `--`', () => {
    const spec = {
      positionals: [{ name: 'pessoa' }, { name: 'texto', optional: true }],
      options: { data: { kind: 'value' } },
    } as const

    expect(
      parseArgv(['bruno', '--data', '2026-11-20', '--', '--não é opção'], spec),
    ).toEqual({
      pessoa: 'bruno',
      texto: '--não é opção',
      data: '2026-11-20',
    })
    expect(parseArgv(['bruno'], spec)).toEqual({
      pessoa: 'bruno',
      texto: undefined,
      data: undefined,
    })
  })

  test.each([
    ['a required option missing', []],
    ['an unknown option', ['--presentes', 'dono', '--nada']],
    ['an ambiguous prefix', ['--presentes', 'dono', '--m', 'x']],
    ['a choice outside the list', ['--presentes', 'dono', '--regra', 'outra']],
    ['a value missing', ['--presentes', 'dono', '--regra']],
    ['a list with no value', ['--presentes', '--sem-lento']],
    ['a value given to a flag', ['--presentes', 'dono', '--sem-lento=sim']],
    ['a short option', ['--presentes', 'dono', '-x']],
    ['a positional nobody takes', ['sobra', '--presentes', 'dono']],
  ])('refuses %s', (_, argv) => {
    expect(() =>
      parseArgv(argv, {
        ...RECOMMEND,
        options: { ...RECOMMEND.options, mais: { kind: 'flag' } },
      }),
    ).toThrow(ArgvError)
  })

  test('mutually exclusive groups, required or not', () => {
    const spec = {
      options: { filme: { kind: 'value' }, nada: { kind: 'flag' } },
      exclusive: [{ options: ['filme', 'nada'], required: true }],
    } as const

    expect(parseArgv(['--nada'], spec)).toEqual({
      filme: undefined,
      nada: true,
    })
    expect(() => parseArgv(['--nada', '--filme', 'tt1'], spec)).toThrow(
      /not allowed/,
    )
    expect(() => parseArgv([], spec)).toThrow(/is required/)
  })

  test('a positional outside its choices, or missing', () => {
    const spec = {
      positionals: [{ name: 'acao', choices: ['responder'] }],
    } as const

    expect(() => parseArgv(['outra'], spec)).toThrow(/invalid choice/)
    expect(() => parseArgv([], spec)).toThrow(/required: acao/)
  })
})
