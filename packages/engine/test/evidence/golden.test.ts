// The Força ruler, the PT wording, the individual utility and the Regra key
// against the golden vectors the Python engine's own modules wrote
// (`golden.py`): 10,000 inputs each, around the 2-year and 5-year edges and
// on every 29 February from 1988 to 2040. A Nota more than 5 years old
// dropped one Força level in Python; the Decaimento replaced that step
// (#173), so those vectors are left out of the comparison.
import * as names from '../python-names.ts'
import { describe, expect, test } from 'vite-plus/test'
import {
  adjustedStrength,
  castStrength,
  contribution,
  durationText,
  evidenceToJson,
  filmText,
  genomeStrength,
  imdbRatingStrength,
  individualUtility,
  integerText,
  isOlderThan,
  LINK_CEILING,
  linkStrength,
  listText,
  makeEvidence,
  moodGenreStrength,
  movielensTagStrength,
  neighborStrength,
  pathStrength,
  ratingText,
  requestMetadataStrength,
  ruleKey,
  ruleToJson,
  seedText,
  similarStrength,
  statedStrength,
  strengthen,
  usesSatisfaction,
  weaken,
  guessStrength,
  HIGH_RATING,
  MIN_NEIGHBOR_BASE,
  MIN_NEIGHBOR_PERCENT,
  SEEN_STRENGTH,
  STATED_YEARS,
  type Evidence,
  type Kind,
  type Rule,
  type SeedKind,
  type Strength,
} from '../../src/index.ts'
import { float, golden, outcome, same, type Tagged } from '../compat/golden.ts'

const FOLDER = new URL('./golden/', import.meta.url)

/** Python's names, in English (`python-names.ts`). */
const english = (table: Record<string, string>, pt: string): string =>
  table[pt] ?? pt
const strength = (pt: string) => english(names.STRENGTHS, pt) as Strength
const kind = (pt: string) => english(names.KINDS, pt) as Kind
const link = (pt: string) => english(names.LINKS, pt)
const level = (pt: string) => english(names.LEVELS, pt)
const rule = (pt: string) => english(names.RULES, pt)

/** A result against a tagged expected value: lists item by item, floats by
 * their bits, a thrown Python exception by its name. */
const isList = (value: Tagged): value is readonly Tagged[] =>
  Array.isArray(value)

const matches = (actual: unknown, expected: Tagged): boolean =>
  isList(expected)
    ? Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((item, i): boolean => matches(actual.at(i), item))
    : same(actual, expected)

const misses = <Row extends { out: Tagged }>(
  rows: readonly Row[],
  call: (row: Row) => unknown,
): Array<Row & { got: unknown }> =>
  rows.flatMap((row) => {
    const got = outcome(() => call(row))
    return matches(got, row.out) ? [] : [{ ...row, got }]
  })

const num = (value: Tagged): number => {
  if (value !== null && typeof value === 'object' && 'f' in value)
    return float(value.f)
  if (value !== null && typeof value === 'object' && 'i' in value)
    return Number(value.i)
  throw new Error(`not a number: ${JSON.stringify(value)}`)
}
const str = (value: Tagged): string => {
  if (typeof value !== 'string')
    throw new Error(`not a string: ${JSON.stringify(value)}`)
  return value
}
const bool = (value: Tagged): boolean => value === true

/** Python's Força names in the expected value, in English. */
const englishOut = (value: Tagged): Tagged => {
  if (typeof value === 'string') return strength(value)
  if (isList(value)) return value.map(englishOut)
  return value
}

const rulerCalls: Record<string, (args: Tagged[]) => unknown> = {
  forca_dito: ([said, specific, date, today]) =>
    statedStrength(
      kind(str(said)) as 'stated' | 'report',
      bool(specific),
      str(date),
      str(today),
    ),
  mais_velha_que: ([date, years, today]) =>
    isOlderThan(str(date), num(years), str(today)),
  forca_caminho: ([count, predicate]) =>
    pathStrength(num(count), link(str(predicate))),
  forca_elenco: ([given, principal]) =>
    castStrength(
      strength(str(given)),
      principal === null ? null : bool(principal),
    ),
  forca_elo: ([given, predicate]) =>
    linkStrength(strength(str(given)), link(str(predicate))),
  forca_ajustada: ([given, adjustment]) =>
    adjustedStrength(strength(str(given)), level(str(adjustment))),
  forca_vizinhanca: ([base, both, ceiling]) =>
    neighborStrength(num(base), num(both), strength(str(ceiling))),
  forca_tag_movielens: ([users]) => movielensTagStrength(num(users)),
  forca_genoma: ([relevance]) => genomeStrength(num(relevance)),
  descer: ([given]) => weaken(strength(str(given))),
  subir: ([given]) => strengthen(strength(str(given))),
  forca_genero_no_clima: () => moodGenreStrength(),
  forca_nota_imdb: () => imdbRatingStrength(),
  forca_parecido: () => similarStrength(),
  forca_metadado_do_pedido: () => requestMetadataStrength(),
  forca_palpite: () => guessStrength(),
}

describe('the Força ruler', () => {
  type RulerRow = { fn: string; args: Tagged[]; out: Tagged }
  /** Python read a Nota by absolute thresholds; the engine reads it by its
   * percentile on the Pessoa's scale (#172, `percentile.test.ts`), so the
   * vectors of the Nota, seed and Feedback rulers no longer apply. */
  const PERCENTILE = new Set(['forca_nota', 'forca_semente', 'forca_feedback'])
  const rows = golden<RulerRow & { constant?: string }>('ruler', FOLDER).filter(
    (row) => !PERCENTILE.has(row.fn),
  )

  test('every function gives what regua.py gives', () => {
    const calls = rows.filter((row) => row.constant === undefined)
    expect(calls.length).toBeGreaterThanOrEqual(7_000)
    expect(
      misses(
        calls.map((row) => ({ ...row, out: englishOut(row.out) })),
        ({ fn, args }) => {
          const f = rulerCalls[fn]
          if (!f) throw new Error(`no port of ${fn}`)
          return f(args)
        },
      ),
    ).toEqual([])
    // Every function of the ruler is in the vectors.
    expect(new Set(calls.map((row) => row.fn))).toEqual(
      new Set(Object.keys(rulerCalls)),
    )
  })

  test('the leap-day and edge vectors are there', () => {
    const dated = rows.filter((row) =>
      ['forca_dito', 'mais_velha_que'].includes(row.fn),
    )
    const today = (row: RulerRow) =>
      str(row.args[row.fn === 'forca_dito' ? 3 : 2] ?? null)
    expect(
      dated.filter((row) => today(row).endsWith('-02-29')).length,
    ).toBeGreaterThan(300)
  })
})

describe('the Força ruler', () => {
  type RulerRow = { fn: string; args: Tagged[]; out: Tagged }
  /** Python read a Nota by absolute thresholds; the engine reads it by its
   * percentile on the Pessoa's scale (#172, `percentile.test.ts`), so the
   * vectors of the Nota, seed and Feedback rulers no longer apply. */
  const PERCENTILE = new Set(['forca_nota', 'forca_semente', 'forca_feedback'])
  const rows = golden<RulerRow & { constant?: string }>('ruler', FOLDER).filter(
    (row) => !PERCENTILE.has(row.fn),
  )

  test('the constants are regua.py’s', () => {
    const constants = Object.fromEntries(
      rows.flatMap((row) =>
        row.constant === undefined ? [] : [[row.constant, row.out]],
      ),
    )
    expect(
      matches(
        [HIGH_RATING, STATED_YEARS, MIN_NEIGHBOR_BASE, MIN_NEIGHBOR_PERCENT],
        [
          constants['NOTA_ALTA'],
          constants['ANOS_DITO'],
          constants['BASE_MINIMA_VIZINHANCA'],
          constants['PORCENTO_MINIMO_VIZINHANCA'],
        ],
      ),
    ).toBe(true)
    expect(SEEN_STRENGTH).toBe(
      strength(str(constants['FORCA_JA_VISTO'] ?? null)),
    )
    const ceiling = constants['TETO_DO_ELO'] as unknown as Record<
      string,
      string
    >
    // The links born after Python left are weak at most (the Dono's
    // decision on #283).
    expect(LINK_CEILING).toEqual({
      ...Object.fromEntries(
        Object.entries(ceiling).map(([pt, s]) => [link(pt), strength(s)]),
      ),
      cinematography: 'weak',
      producer: 'weak',
    })
  })
})

/** A seed Nota on the 1 to 10 scale (#272): texto.py wrote "deu 4,5 a X",
 * the engine writes "deu 9 de 10 a X". The decision changes only that. */
const onTen = (row: { fn: string; args: Tagged[]; out: Tagged }) =>
  row.fn === 'semente' && row.args[0] === 'nota' && typeof row.out === 'string'
    ? {
        ...row,
        out: row.out.replace(
          /^deu ([\d,]+) a /u,
          (_, n: string) =>
            `deu ${ratingText(Number(n.replace(',', '.')) * 2)} de 10 a `,
        ),
      }
    : row

describe('the PT wording', () => {
  const rows = golden<{ fn: string; args: Tagged[]; out: Tagged }>(
    'wording',
    FOLDER,
  ).map(onTen)
  const call: Record<string, (args: Tagged[]) => unknown> = {
    nota: ([value]) => ratingText(num(value)),
    semente: ([seed, value, film]) =>
      seedText(kind(str(seed)) as SeedKind, num(value), str(film)),
    lista: ([items]) => listText((items as Tagged[]).map(str)),
    filme: ([title, year]) =>
      filmText(str(title), year === null ? null : num(year)),
    inteiro: ([value]) => integerText(num(value)),
    duracao: ([minutes]) => durationText(num(minutes)),
  }

  test('every line reads as texto.py writes it', () => {
    expect(rows.length).toBeGreaterThanOrEqual(10_000)
    expect(
      misses(rows, ({ fn, args }) => {
        const f = call[fn]
        if (!f) throw new Error(`no port of ${fn}`)
        return f(args)
      }),
    ).toEqual([])
    expect(new Set(rows.map((row) => row.fn))).toEqual(
      new Set(Object.keys(call)),
    )
  })
})

type Weighted = Record<string, Record<string, Tagged>>

const weightsOf = (pesos: Weighted) => {
  const m = pesos['forca'] as unknown as {
    multiplicador: Record<string, Tagged>
  }
  const u = pesos['utilidade'] ?? {}
  return {
    strength: {
      multiplier: {
        strong: num(m.multiplicador['forte'] ?? null),
        moderate: num(m.multiplicador['moderada'] ?? null),
        weak: num(m.multiplicador['fraca'] ?? null),
        guess: num(m.multiplicador['palpite'] ?? null),
      },
    },
    utility: {
      k: num(u['k'] ?? null),
      max_evidence: num(u['evidencias_maximas'] ?? null),
    },
  }
}

describe('Evidence and utility', () => {
  const rows = golden<{
    pesos: Weighted
    evidencias: Array<{
      forca: string
      tipo: string
      base: Tagged
      ja_visto: boolean
    }>
    contribuicoes: Tagged[]
    json: Tagged[]
    out: Tagged
  }>('utility', FOLDER)

  const evidenceOf = (
    row: (typeof rows)[number]['evidencias'][number],
  ): Evidence =>
    makeEvidence({
      person: 'bruno',
      filmId: 'tt9000101',
      text: 'x',
      source: null,
      date: null,
      strength: strength(row.forca),
      kind: kind(row.tipo),
      factId: null,
      base: num(row.base),
      seen: row.ja_visto,
    })

  test('contribution, its rounding and the utility are utilidade.py’s', () => {
    expect(rows.length).toBeGreaterThanOrEqual(10_000)
    const wrong = rows.flatMap((row) => {
      const weights = weightsOf(row.pesos)
      const evidence = row.evidencias.map(evidenceOf)
      const got = {
        contributions: evidence.map((e) => contribution(e, weights)),
        json: evidence.map((e) => evidenceToJson(e, weights).contribution),
        utility: outcome(() => individualUtility(evidence, weights)),
      }
      return matches(got.contributions, row.contribuicoes) &&
        matches(got.json, row.json) &&
        matches(got.utility, row.out)
        ? []
        : [{ row, got }]
    })
    expect(wrong).toEqual([])
  })
})

describe('the Regra key', () => {
  const rows = golden<{
    nome: string
    pessoa: string | null
    utilidades: Array<[string, Tagged]>
    ajuste: Array<[string, Tagged]> | null
    usa_credito: boolean
    json: { nome: string; pessoa?: string }
    out: Tagged
  }>('rule', FOLDER)

  test('the key, the satisfaction adjustment and the JSON are regra.py’s', () => {
    expect(rows.length).toBeGreaterThanOrEqual(10_000)
    const wrong = rows.flatMap((row) => {
      const name = rule(row.nome)
      const r: Rule =
        name === 'by'
          ? { name, person: row.pessoa ?? '' }
          : { name: name as 'default' | 'average' }
      const utilities = new Map(
        row.utilidades.map(([p, u]): [string, number | null] => [
          p,
          u === null ? null : num(u),
        ]),
      )
      const adjustment =
        row.ajuste === null
          ? undefined
          : new Map(row.ajuste.map(([p, a]): [string, number] => [p, num(a)]))
      const key = outcome(() => ruleKey(r, utilities, adjustment))
      const json = ruleToJson(r)
      const expectedJson = {
        name: rule(row.json.nome),
        ...(row.json.pessoa ? { person: row.json.pessoa } : {}),
      }
      return matches(key, row.out) &&
        usesSatisfaction(r) === row.usa_credito &&
        JSON.stringify(json) === JSON.stringify(expectedJson)
        ? []
        : [{ row, key, json }]
    })
    expect(wrong).toEqual([])
  })
})
