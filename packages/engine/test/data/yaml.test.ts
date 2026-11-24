// The frontmatter YAML against PyYAML (`golden.py`): every plain scalar
// resolves to the type `safe_load` gives it, every frontmatter
// `safe_dump` wrote reads back to the same value, and what the port writes
// reads back the same.
import { describe, expect, test } from 'vite-plus/test'
import {
  isMapping,
  isPyFloat,
  isPyInt,
  isSequence,
  parseYaml,
  pyDate,
  pyIterate,
  pyReprValue,
  pyStrValue,
  pyTruthy,
  stringifyYaml,
  yamlToJson,
  YamlError,
  type YamlValue,
} from '../../src/data/yaml.ts'
import { pyFloat, pyInt } from '../../src/index.ts'
import { float, golden, type Tagged } from '../compat/golden.ts'

type TaggedYaml =
  | Tagged
  | { readonly m: ReadonlyArray<readonly [string, TaggedYaml]> }
  | readonly TaggedYaml[]

const same = (actual: YamlValue, expected: TaggedYaml): boolean => {
  if (Array.isArray(expected))
    return (
      isSequence(actual) &&
      actual.length === expected.length &&
      actual.every((item, i) => same(item, expected[i] as TaggedYaml))
    )
  if (expected !== null && typeof expected === 'object') {
    if ('m' in expected) {
      if (!isMapping(actual) || actual.size !== expected.m.length) return false
      const entries = [...actual]
      return expected.m.every(
        ([key, value], i) =>
          entries[i]?.[0] === key && same(entries[i][1], value),
      )
    }
    if ('f' in expected)
      return isPyFloat(actual) && Object.is(actual.float, float(expected.f))
    if ('i' in expected)
      return isPyInt(actual) && BigInt(actual.int) === BigInt(expected.i)
    return false
  }
  return actual === expected
}

const parsed = (text: string): YamlValue | { error: string } => {
  try {
    return parseYaml(text)
  } catch (error) {
    if (error instanceof YamlError || error instanceof RangeError)
      return { error: error.name }
    throw error
  }
}

describe('YAML as PyYAML reads it', () => {
  const rows = golden<{ s: string; out: TaggedYaml }>('yaml-scalar')

  test('a plain scalar has the type safe_load gives it', () => {
    expect(rows.length).toBeGreaterThanOrEqual(10_000)
    const wrong = rows.flatMap(({ s, out }): unknown[] => {
      const got = parsed(`v: ${s}\n`)
      const refused = typeof out === 'object' && out !== null && 'error' in out
      if (refused) return 'error' in Object(got) ? [] : [{ s, out, got }]
      if (got instanceof Map && same(got.get('v') ?? null, out)) return []
      return [{ s, out, got }]
    })
    expect(wrong).toEqual([])
  })

  test('text the port writes plain, PyYAML reads as the same text', () => {
    const wrong = rows.flatMap(({ s, out }) => {
      const text = stringifyYaml(new Map([['v', s]]))
      const back = parseYaml(text)
      const plain = text === `v: ${s}\n`
      return isMapping(back) && back.get('v') === s && (!plain || out === s)
        ? []
        : [{ s, text, out }]
    })
    expect(wrong).toEqual([])
  })

  test('every frontmatter safe_dump wrote reads back, and round-trips', () => {
    const dumps = golden<{ yaml: string; value: TaggedYaml }>('yaml-dump')
    expect(dumps.length).toBeGreaterThanOrEqual(2500)
    const wrong = dumps.flatMap(({ yaml, value }) => {
      // Refused, not misread: see parseYaml.
      if (/[\u{2028}\u{2029}]/u.test(yaml))
        return 'error' in Object(parsed(yaml)) ? [] : [{ yaml, value }]
      const read = parseYaml(yaml)
      const again = parseYaml(stringifyYaml(read))
      return same(read, value) && same(again, value) ? [] : [{ yaml, value }]
    })
    expect(wrong).toEqual([])
    // ~2 s of parsing alone; the default 5 s is not enough on a loaded machine.
  }, 30_000)

  test('collections of scalars go in flow style, like default_flow_style=None', () => {
    const value = new Map<string, YamlValue>([
      ['name', 'Ana'],
      ['aliases', ['Aninha', 'yes', '2026-11-20']],
      ['vetoes', []],
      [
        'open_questions',
        [
          new Map<string, YamlValue>([
            ['text', "o 'x'?"],
            ['skips', pyInt(1)],
          ]),
        ],
      ],
      ['ratio', pyFloat(1e-5)],
      ['none', null],
      ['owner', true],
    ])
    expect(stringifyYaml(value)).toBe(
      [
        'name: Ana',
        "aliases: [Aninha, 'yes', '2026-11-20']",
        'vetoes: []',
        'open_questions:',
        "- {text: 'o ''x''?', skips: 1}",
        'ratio: 1.0e-05',
        'none: null',
        'owner: true',
        '',
      ].join('\n'),
    )
    expect(stringifyYaml(new Map([['a', 'b']]))).toBe('{a: b}\n')
  })

  test('merge keys, anchors and repeated keys read as PyYAML reads them', () => {
    const value = parseYaml(
      'base: &b {a: 1, b: 2}\nother: {<<: *b, b: 3, c: *b}\nk: 1\nk: 2\n',
    )
    expect(isMapping(value) && [...value.keys()]).toEqual([
      'base',
      'other',
      'k',
    ])
    const other = isMapping(value) ? value.get('other') : null
    expect(isMapping(other) && [...other.keys()]).toEqual(['a', 'b', 'c'])
    expect(isMapping(other) && other.get('b')).toEqual(pyInt(3))
    expect(isMapping(value) && value.get('k')).toEqual(pyInt(2))
    const many = parseYaml('x: {<<: [{a: 1}, {a: 2, b: 2}]}\n')
    const x = isMapping(many) ? many.get('x') : null
    expect(isMapping(x) && x.get('a')).toEqual(pyInt(1))
  })

  test.each([
    ['a: [unclosed\n', /sufficiently indented/],
    ['a: !!binary aGk=\n', /Unresolved tag/],
    ['a: <<\n', /no constructor|could not determine a constructor/],
    ['{<<: 1}\n', /mappings for merging/],
    ['? [a]\n: 1\n', /unhashable key/],
    ['a: 0b_\n', /invalid literal for int\(\) with base 2/],
    ['a: =\n', /tag:yaml.org,2002:value/],
    ['a: "\x7f"\n', /unacceptable character #x007f/],
  ])('refuses what PyYAML refuses: %j', (text, message) => {
    expect(() => parseYaml(text)).toThrow(message)
  })

  test('timestamps become the str() of the date or datetime', () => {
    const at = (text: string) => {
      const value = parseYaml(`v: ${text}\n`)
      return isMapping(value) ? value.get('v') : undefined
    }
    expect(at('2026-11-20')).toBe('2026-11-20')
    expect(at('2026-1-5 1:02:03')).toBe('2026-01-05 01:02:03')
    expect(at('2026-11-20T10:00:00.5Z')).toBe(
      '2026-11-20 10:00:00.500000+00:00',
    )
    expect(at('2026-11-20 10:00:00 -3:30')).toBe('2026-11-20 10:00:00-03:30')
    expect(at('2026-11-20 10:00:00 -0')).toBe('2026-11-20 10:00:00+00:00')
    for (const bad of [
      '2026-02-30',
      '0000-01-01',
      '2026-13-01',
      '2026-11-20 24:00:00',
      '2026-11-20 10:60:00',
      '2026-11-20 10:00:60',
      '2026-11-20 10:00:00+24',
    ])
      expect(() => at(bad)).toThrow(YamlError)
  })
})

describe("Python's view of a value", () => {
  test('truthiness, str(), repr() and iteration', () => {
    const map = new Map<string, YamlValue>([['a', [pyInt(1), null, true]]])
    expect(
      (
        [
          '',
          'x',
          null,
          true,
          false,
          pyInt(0),
          pyInt(2n),
          pyFloat(0),
          pyFloat(0.5),
          [],
          [null],
          new Map(),
          map,
        ] satisfies YamlValue[]
      ).map((value) => pyTruthy(value)),
    ).toEqual([
      false,
      true,
      false,
      true,
      false,
      false,
      true,
      false,
      true,
      false,
      true,
      false,
      true,
    ])
    expect(pyTruthy(undefined)).toBe(false)
    expect(pyReprValue(map)).toBe("{'a': [1, None, True]}")
    expect(pyStrValue(map)).toBe("{'a': [1, None, True]}")
    expect(pyStrValue(pyFloat(4))).toBe('4.0')
    expect(pyIterate('Ana')).toEqual(['A', 'n', 'a'])
    expect(pyIterate(map)).toEqual(['a'])
    expect(pyIterate([true])).toEqual([true])
    expect(() => pyIterate(pyInt(1))).toThrow("'int' object is not iterable")
    expect(() => pyIterate(null)).toThrow("'NoneType'")
    expect(() => pyIterate(false)).toThrow("'bool'")
    expect(() => pyIterate(pyFloat(1))).toThrow("'float'")
  })
})

describe('a date the engine writes', () => {
  test('goes plain, as PyYAML writes a date, and reads back as its text', () => {
    const text = stringifyYaml(
      new Map<string, YamlValue>([
        ['date', pyDate('2026-11-20')],
        ['text', '2026-11-20'],
      ]),
    )

    expect(text).toBe("{date: 2026-11-20, text: '2026-11-20'}\n")
    expect(parseYaml(text)).toEqual(
      new Map([
        ['date', '2026-11-20'],
        ['text', '2026-11-20'],
      ]),
    )
  })

  test('is a date to Python', () => {
    const date = pyDate('2026-01-05')

    expect(pyTruthy(date)).toBe(true)
    expect(pyStrValue(date)).toBe('2026-01-05')
    expect(pyReprValue(date)).toBe('datetime.date(2026, 1, 5)')
    expect(yamlToJson(new Map([['d', date]]))).toEqual({ d: '2026-01-05' })
    expect(() => pyIterate(date)).toThrow(
      "TypeError: 'datetime.date' object is not iterable",
    )
  })
})
