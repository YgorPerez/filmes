import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'
import { main } from '../src/cli.ts'
import {
  CONFIG,
  FIXTURE_DATA,
  readTree,
  scratch,
  writeTree,
} from './helpers.ts'

function run(...argv: string[]) {
  const out: string[] = []
  const err: string[] = []
  const code = main(argv, { out: (l) => out.push(l), err: (l) => err.push(l) })
  return { code, out, err }
}

describe('the command line', () => {
  test('round-trip over the fixture and config/ exits 0', () => {
    const data = run('round-trip', '--data', FIXTURE_DATA)
    expect(data.code).toBe(0)
    expect(data.out[0]).toMatch(
      /^\d+ identical, 0 normalized from an older shape, 0 different$/,
    )
    expect(run('round-trip', '--config', CONFIG).code).toBe(0)
  })

  test('round-trip lists what did not come back, and exits 1', () => {
    const work = scratch()
    writeTree(work, {
      'pessoas/a.md': '---\nvetos:\n- {alvo: slow}\n---\n',
      'sessoes/s.md': '---\nregra: media-sem-miseria-com-justica\n---\n',
    })
    expect(run('round-trip', '--data', work)).toEqual({
      code: 1,
      out: [
        '0 identical, 1 normalized from an older shape, 1 different',
        'normalized: sessoes/s.md',
        'different: pessoas/a.md',
      ],
      err: [],
    })
  })

  test('to-en and to-pt write the destination', () => {
    const work = scratch()
    const en = run('to-en', '--data', FIXTURE_DATA, '--out', join(work, 'en'))
    expect(en).toEqual({
      code: 0,
      out: ['6 rewritten, 0 copied as is'],
      err: [],
    })
    expect(Object.keys(readTree(join(work, 'en')))).toContain('people/quim.md')
    expect(
      run('to-pt', '--data', join(work, 'en'), '--out', join(work, 'pt')).code,
    ).toBe(0)
    expect(readTree(join(work, 'pt'))).toEqual(readTree(FIXTURE_DATA))
  })

  test('a migration error exits 1 with the message', () => {
    const work = scratch()
    writeTree(join(work, 'dados'), { 'pessoas/a.md': '---\ncor: azul\n---\n' })
    expect(
      run('to-en', '--data', join(work, 'dados'), '--out', join(work, 'en')),
    ).toEqual({
      code: 1,
      out: [],
      err: ["pessoas/a.md: $: unknown key 'cor'"],
    })
  })

  test.each([
    [[]],
    [['to-en', '--data', 'x']],
    [['sideways', '--data', 'x', '--out', 'y']],
    [['to-en', '--data', 'x', '--config', 'y', '--out', 'z']],
    [['round-trip', '--data', 'x', '--out', 'y']],
    [['round-trip', '--nope']],
  ])('wrong usage exits 2: %j', (argv) => {
    const result = run(...argv)
    expect(result.code).toBe(2)
    expect(result.err.join('\n')).toContain('usage:')
  })
})
