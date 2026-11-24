import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vite-plus/test'
import {
  outputToEnglish,
  outputToPortuguese,
  renameValue,
} from '../src/output.ts'
import { closed, invert, map } from '../src/shape.ts'
import { COMMANDS } from '../src/tables/output.ts'

/** Outputs the Python CLI printed during its test suite, one or more per
 * command, picked to cover every key and closed-list value it printed. */
const outputs = readFileSync(
  new URL('./python-outputs.jsonl', import.meta.url),
  'utf8',
)
  .split('\n')
  .filter(Boolean)
  .map((line, i) => ({
    i,
    ...(JSON.parse(line) as { command: string; output: unknown }),
  }))

describe('the Python output in English', () => {
  test('every command has a sample', () => {
    const sampled = new Set(outputs.map((o) => o.command))
    expect(Object.keys(COMMANDS).filter((c) => !sampled.has(c))).toEqual([])
  })

  test.each(outputs)(
    '$command #$i maps, and maps back to the same output',
    ({ command, output }) => {
      const english = outputToEnglish(command, output)
      expect(outputToPortuguese(command, english)).toEqual(output)
    },
  )

  test('a recommendation', () => {
    const english = outputToEnglish('recomendar', {
      presentes: ['bruno'],
      regra: { nome: 'padrao' },
      restricoes: {
        sem_tristeza: { tirados: 2, por_sinal: { triste: 1, tema_pesado: 1 } },
      },
      filmes: [
        {
          posicao: 1,
          utilidade: { bruno: 0.97 },
          evidencias: {
            bruno: [
              {
                forca: 'forte',
                tipo: 'nota',
                fato_id: 'notas:1',
                texto: 'deu 5',
              },
            ],
          },
        },
      ],
      saidas: [{ motivo: 'nota_minima', rotulo: 'nota 6,5 no IMDb' }],
    })
    expect(english).toEqual({
      attendees: ['bruno'],
      rule: { name: 'default' },
      constraints: {
        no_sad: { removed: 2, bySignal: { sad: 1, heavy_theme: 1 } },
      },
      films: [
        {
          position: 1,
          utility: { bruno: 0.97 },
          evidence: {
            bruno: [
              {
                strength: 'strong',
                kind: 'rating',
                factId: 'notas:1',
                text: 'deu 5',
              },
            ],
          },
        },
      ],
      dropped: [{ cause: 'min_rating', label: 'nota 6,5 no IMDb' }],
    })
  })

  test('an error, from any command', () => {
    expect(
      outputToEnglish('qualquer', {
        erro: { codigo: 'relato_ambiguo', mensagem: 'mais de um' },
      }),
    ).toEqual({ error: { code: 'ambiguous_report', message: 'mais de um' } })
    expect(
      outputToPortuguese('qualquer', {
        error: { code: 'invalid_usage', message: 'x' },
      }),
    ).toEqual({
      erro: { codigo: 'uso_invalido', mensagem: 'x' },
    })
  })

  test('a command or a key outside the tables is an error', () => {
    expect(() => outputToEnglish('nada', {})).toThrow(
      "no output table for 'nada'",
    )
    expect(() => outputToPortuguese('nada', {})).toThrow(
      "no output table for 'nada'",
    )
    expect(() =>
      outputToEnglish('verificar', { valida: true, extra: 1 }),
    ).toThrow("$: unknown key 'extra'")
    expect(() => outputToEnglish('pessoa remover', { tipo: 'outro' })).toThrow(
      '$.tipo: unknown value "outro"',
    )
  })

  test('the tables can be read both ways', () => {
    for (const { shape } of Object.values(COMMANDS))
      expect(() => invert(shape)).not.toThrow()
  })
})

describe('renameValue', () => {
  const shape = map({
    data: 'date',
    nivel: ['level', closed({ nada: 'none' })],
  })

  test('a date is a single value', () => {
    const date = new Date('2026-11-20')
    expect(renameValue({ data: date }, shape)).toEqual({ date })
  })

  test('null and missing values pass', () => {
    expect(renameValue(null, shape)).toBeNull()
    expect(renameValue({ nivel: null }, shape)).toEqual({ level: null })
  })

  test('a shape it does not expect is an error', () => {
    expect(() => renameValue([1], shape)).toThrow(
      'a list where none was expected',
    )
    expect(() => renameValue({ nivel: { a: 1 } }, shape)).toThrow(
      'a map where none was expected',
    )
    expect(() => renameValue(1, shape)).toThrow(
      'a single value where none was expected',
    )
  })

  test('two Portuguese names for one English name cannot be inverted', () => {
    expect(() => invert(map({ a: 'x', b: 'x' }))).toThrow(
      "'a' and 'b' both become 'x'",
    )
  })
})
