import { describe, expect, test } from 'vite-plus/test'
import { invertToml, rewriteToml, type TomlShape } from '../src/rewrite-toml.ts'

const SHAPE: TomlShape = {
  tables: {
    '': { name: '', keys: { topo: 'top' } },
    'a.b': { name: 'x.y', keys: { chave: 'key', lista: 'list' } },
  },
}

describe('rewriteToml', () => {
  test('renames headers and keys and keeps comments, values and layout', () => {
    const text = [
      '# comentário',
      'topo = 1 # fim de linha',
      '',
      '[a.b]  # tabela',
      '  chave = "valor [com] colchete # e cerquilha"',
      'lista = [',
      '  "um", # [não é tabela]',
      "  'dois',",
      '  "três \\" aspas",',
      ']',
    ].join('\n')
    const english = rewriteToml(text, SHAPE)
    expect(english).toBe(
      [
        '# comentário',
        'top = 1 # fim de linha',
        '',
        '[x.y]  # tabela',
        '  key = "valor [com] colchete # e cerquilha"',
        'list = [',
        '  "um", # [não é tabela]',
        "  'dois',",
        '  "três \\" aspas",',
        ']',
      ].join('\n'),
    )
    expect(rewriteToml(english, invertToml(SHAPE))).toBe(text)
  })

  test('refuses what it does not read, instead of skipping it', () => {
    expect(() => rewriteToml('[c]', SHAPE)).toThrow('unknown table [c]')
    expect(() => rewriteToml('[a.b]\nnada = 1', SHAPE)).toThrow(
      "unknown key 'nada' in [a.b]",
    )
    expect(() => rewriteToml('chave = 1', { tables: {} })).toThrow(
      'outside a known table',
    )
    expect(() => rewriteToml('[[a.b]]', SHAPE)).toThrow('arrays of tables')
    expect(() => rewriteToml('topo = { x = 1 }', SHAPE)).toThrow(
      'inline tables',
    )
    expect(() => rewriteToml('topo = """a"""', SHAPE)).toThrow(
      'multi-line strings',
    )
    expect(() => rewriteToml('topo = "a', SHAPE)).toThrow('unclosed string')
    expect(() => rewriteToml('"quoted key" = 1', SHAPE)).toThrow(
      'a line this script does not read',
    )
    expect(() =>
      rewriteToml('topo = 1', {
        tables: { '': { name: '', keys: { topo: 'a b' } } },
      }),
    ).toThrow('not a bare key')
  })

  test('the other way needs one name per table and per key', () => {
    expect(() =>
      invertToml({
        tables: {
          a: { name: 'x', keys: {} },
          b: { name: 'x', keys: {} },
        },
      }),
    ).toThrow('two tables become [x]')
    expect(() =>
      invertToml({ tables: { a: { name: 'x', keys: { p: 'k', q: 'k' } } } }),
    ).toThrow("'p' and 'q' both become 'k'")
    expect(invertToml({ tables: {}, anyTable: { generos: 'genres' } })).toEqual(
      {
        tables: {},
        anyTable: { genres: 'generos' },
      },
    )
  })
})
