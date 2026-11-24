// The whole `recomendar` output, the engine's against the Python's, on the
// same database: what the oracle checks for every fixture scenario, here for
// requests that cover each part of the pipeline. The setup steps go through
// the Python CLI (`support.ts`).

import { describe, expect, test } from 'vite-plus/test'
import { useFixture } from '../fixture.ts'
import { RECORDINGS } from '../sources/support.ts'
import { expectParity, pythonOk, weightsWith } from './support.ts'

describe('the engine recommends as the Python does', () => {
  test.each([
    {
      name: 'the Dono alone, every film',
      args: ['--presentes', 'dono', '--quantos', '100'],
      request: { attendees: ['dono'], count: 100 },
    },
    {
      name: 'the default size, in a group',
      args: ['--presentes', 'dono', 'Iara'],
      request: { attendees: ['dono', 'Iara'] },
    },
    {
      name: 'Presentes by comma, with someone with no Nota',
      args: ['--presentes', 'eu,teo', '--quantos', '100'],
      request: { attendees: ['eu,teo'], count: 100 },
    },
    {
      name: 'the average rule',
      args: [
        '--presentes',
        'dono',
        'quim',
        '--regra',
        'media',
        '--quantos',
        '50',
      ],
      request: { attendees: ['dono', 'quim'], rule: 'average', count: 50 },
    },
    {
      name: "someone's rule, from --de alone",
      args: ['--presentes', 'dono', 'quim', '--de', 'quim', '--quantos', '50'],
      request: { attendees: ['dono', 'quim'], by: 'quim', count: 50 },
    },
    {
      name: "someone's rule, named",
      args: ['--presentes', 'dono', 'iara', '--regra', 'de', '--de', 'Bruno'],
      request: { attendees: ['dono', 'iara'], rule: 'by', by: 'Bruno' },
    },
    {
      name: 'Climas, one outside the vocabulary',
      args: [
        '--presentes',
        'dono',
        '--quantos',
        '50',
        '--clima',
        'Leve',
        'épico',
        'pra rir',
      ],
      request: {
        attendees: ['dono'],
        count: 50,
        moods: ['Leve', 'épico', 'pra rir'],
      },
    },
    {
      name: 'Climas without accents or case, someone with no Nota',
      args: [
        '--presentes',
        'teo',
        '--quantos',
        '50',
        '--clima',
        'ACAO',
        'Pra-Rir',
        'tenso',
      ],
      request: {
        attendees: ['teo'],
        count: 50,
        moods: ['ACAO', 'Pra-Rir', 'tenso'],
      },
    },
    {
      name: 'the cast and director ceilings',
      args: ['--presentes', 'rosa', '--quantos', '100'],
      request: { attendees: ['rosa'], count: 100 },
    },
  ] as const)('$name', async ({ args, request }) => {
    const fixture = useFixture()
    await expectParity(fixture, args, request)
  })

  test('the poster, title and synopsis from the TMDB', async () => {
    const fixture = useFixture()
    const vars = { FILMES_TMDB_CHAVE: 'x', FILMES_GRAVACOES: RECORDINGS }
    const out = await expectParity(
      fixture,
      ['--presentes', 'dono', 'iara', '--quantos', '8'],
      { attendees: ['dono', 'iara'], count: 8 },
      { python: vars, engine: vars },
    )
    expect(out.films.some((f) => f.poster)).toBe(true)
  })

  test('Vetos to a tag group and to a genre', async () => {
    const fixture = useFixture()
    pythonOk(fixture, ['pessoa', 'criar', 'Lorenzo', '--slug', 'lorenzo'])
    pythonOk(fixture, [
      'pessoa',
      'vetar',
      'lorenzo',
      'não vê romance',
      '--entidade',
      'Q1054574',
    ])
    pythonOk(fixture, [
      'pessoa',
      'vetar',
      'bruno',
      'não quer comédia boba',
      '--grupo',
      'comedia_boba',
    ])

    const out = await expectParity(
      fixture,
      ['--presentes', 'dono', 'lorenzo', '--quantos', '100'],
      { attendees: ['dono', 'lorenzo'], count: 100 },
    )
    expect(out.vetoes.map((v) => v.target)).toEqual([
      'silly_comedy',
      'Q1054574',
    ])
  })

  test('Ajustes, a Declarado on an entity and a Relato on a film', async () => {
    const fixture = useFixture()
    pythonOk(fixture, [
      'pessoa',
      'ajustar',
      'bruno',
      '--elo',
      'elenco',
      '--nivel',
      'pouco',
    ])
    pythonOk(fixture, [
      'pessoa',
      'ajustar',
      'bruno',
      '--elo',
      'roteiro',
      '--nivel',
      'muito',
    ])
    pythonOk(fixture, [
      'pessoa',
      'ajustar',
      'bruno',
      '--elo',
      'diretor',
      '--nivel',
      'nada',
    ])
    pythonOk(fixture, [
      'pessoa',
      'declarar',
      'bruno',
      'adoro o Davi Couto',
      '--entidade',
      'Q9001803',
      '--reacao',
      'gosta',
    ])
    pythonOk(fixture, ['pessoa', 'criar', 'Ana', '--slug', 'ana'])
    pythonOk(fixture, [
      'pessoa',
      'relatar',
      'ana',
      'ama O Farol',
      '--filme',
      'tt9000101',
      '--reacao',
      'ama',
    ])
    pythonOk(fixture, [
      'pessoa',
      'declarar',
      'ana',
      'odeia Barulho',
      '--filme',
      'tt9000501',
      '--reacao',
      'odeia',
    ])
    pythonOk(fixture, ['reconstruir'])

    await expectParity(
      fixture,
      ['--presentes', 'dono', 'ana', '--quantos', '100'],
      { attendees: ['dono', 'ana'], count: 100 },
    )
  })

  test('the cut of the strongest, and a link left out of the weights', async () => {
    const fixture = useFixture()
    const cut = weightsWith(
      fixture,
      '\nevidencias_maximas = 5\n',
      '\nevidencias_maximas = 1\n',
    )
    await expectParity(
      fixture,
      ['--presentes', 'dono', '--quantos', '100'],
      { attendees: ['dono'], count: 100 },
      cut,
    )
    const noWriter = weightsWith(fixture, '\nroteiro = 0.8\n', '\n')
    await expectParity(
      fixture,
      ['--presentes', 'dono', '--quantos', '100'],
      { attendees: ['dono'], count: 100 },
      noWriter,
    )
  })

  test('the Crédito, its line and the order it changes', async () => {
    const fixture = useFixture()
    const noImdbBonus = weightsWith(
      fixture,
      '\npeso = 0.3\n\n[sem_tristeza]',
      '\npeso = 0.0\n\n[sem_tristeza]',
    )
    const session = pythonOk(
      fixture,
      ['recomendar', '--presentes', 'dono', 'quim', '--quantos', '50'],
      noImdbBonus.python,
    ) as { sessao: { id: string } }
    pythonOk(fixture, [
      'feedback',
      '--sessao',
      session.sessao.id,
      '--filme',
      'Pequenos Milagres',
      '--nota',
      'dono=1',
      '--nota',
      'quim=5',
    ])

    const out = await expectParity(
      fixture,
      ['--presentes', 'dono', 'quim', '--quantos', '50'],
      { attendees: ['dono', 'quim'], count: 50 },
      noImdbBonus,
    )
    expect(out.credit).toEqual({ bruno: 0.4444, quim: 0 })
    expect(
      out.films.some((f) => f.filmLines.some((l) => l.person === 'bruno')),
    ).toBe(true)
    // A Relato in the Feedback, and the Crédito outside the default Regra.
    pythonOk(fixture, ['reconstruir'])
    const again = pythonOk(fixture, [
      'recomendar',
      '--presentes',
      'dono',
      'quim',
      'iara',
      '--quantos',
      '5',
    ]) as { sessao: { id: string } }
    pythonOk(fixture, [
      'feedback',
      '--sessao',
      again.sessao.id,
      '--filme',
      'Voo Noturno',
      '--relato',
      'iara=não gostou',
      '--nota',
      'dono=4',
      '--nota',
      'quim=5',
    ])
    await expectParity(
      fixture,
      ['--presentes', 'dono', 'iara', '--quantos', '30'],
      { attendees: ['dono', 'iara'], count: 30 },
      noImdbBonus,
    )
    await expectParity(
      fixture,
      ['--presentes', 'dono', 'iara', '--regra', 'media', '--quantos', '30'],
      { attendees: ['dono', 'iara'], rule: 'average', count: 30 },
      noImdbBonus,
    )
  })
})
