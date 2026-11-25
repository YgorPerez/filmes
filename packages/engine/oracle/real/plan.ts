// The seeded request generator of the real-database run (#76 §4.2, item 2):
// about 300 `recomendar` calls over the real Pessoas, each opening a
// Session, and what the Dono does next on it. The same seed and inputs give
// the same plan, so a report names its seed and can be replayed.
//
// A step's argv may depend on what Python answered before it (the Session
// id, the films on screen), so a step is a function of the scenario's
// earlier seed-0 outputs.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { answerFromSession } from './answer.ts'

/** What a step's argv is built from: the Python (seed 0) outputs of the
 * scenario's earlier steps, in Portuguese, and the seed-0 folder. */
export interface PlanContext {
  readonly outputs: readonly unknown[]
  /** Python's seed-0 folder: `dados/` is its filmes-dados. */
  readonly work: string
}

export interface PlannedStep {
  readonly build: (context: PlanContext) => {
    readonly argv: readonly string[]
    readonly stdin: string | null
  }
}

export interface PlannedScenario {
  /** Anonymised: the kind and a number, never a Pessoa. */
  readonly id: string
  readonly steps: readonly PlannedStep[]
}

export interface PlanInputs {
  /** The Pessoas' slugs. */
  readonly people: readonly string[]
  /** The Dono's slug: a Relato is about someone else. */
  readonly owner?: string
  /** The Climas of `config/climas.toml`. */
  readonly moods: readonly string[]
  /** Films a `--parecido` may name (well-known ones, with tags). */
  readonly references: readonly string[]
}

export interface PlanOptions {
  readonly seed: number
  /** How many `recomendar` scenarios (default 300). */
  readonly count?: number
}

/** mulberry32: a small, seedable PRNG. */
export function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const RULES = ['padrao', 'media', 'de'] as const

/** The Restrições a request can carry, each with its seeded arguments. */
const RESTRICTIONS: ReadonlyArray<
  readonly [string, (pick: Picker, inputs: PlanInputs) => string[]]
> = [
  ['duracao-max', (p) => ['--duracao-max', String(p.int(80, 180))]],
  // Apart, so the pair never asks for `--desde` after `--ate`.
  ['desde', (p) => ['--desde', String(p.int(1950, 1994))]],
  ['ate', (p) => ['--ate', String(p.int(1995, 2024))]],
  ['idioma', (p) => ['--idioma', p.one(['pt', 'en', 'fr', 'ja', 'português'])]],
  ['sem-ja-visto', () => ['--sem-ja-visto']],
  ['sem-lento', () => ['--sem-lento']],
  ['sem-tristeza', () => ['--sem-tristeza']],
  [
    'crianca',
    (p) =>
      p.chance(0.2) ? ['--crianca'] : ['--crianca', String(p.int(3, 15))],
  ],
  ['gatilho', (p) => ['--gatilho', p.one(['a dog dies', 'a cat dies'])]],
  [
    'parecido',
    (p, inputs) => ['--parecido', ...p.some(inputs.references, 1, 2)],
  ],
]

/** No Restrição, each alone, then each pair: every combination §4.2 asks
 * for, cycled over the scenarios. */
export const RESTRICTION_SETS: readonly (readonly number[])[] = [
  [],
  ...RESTRICTIONS.map((_, i) => [i]),
  ...RESTRICTIONS.flatMap((_, i) =>
    RESTRICTIONS.slice(i + 1).map((_, k) => [i, i + 1 + k]),
  ),
]

interface Picker {
  readonly int: (low: number, high: number) => number
  readonly one: <A>(items: readonly A[]) => A
  readonly some: <A>(items: readonly A[], low: number, high: number) => A[]
  readonly chance: (p: number) => boolean
}

function picker(next: () => number): Picker {
  const int = (low: number, high: number) =>
    low + Math.floor(next() * (high - low + 1))
  const one = <A>(items: readonly A[]): A => {
    if (items.length === 0) throw new Error('real plan: nothing to pick from')
    return items[int(0, items.length - 1)] as A
  }
  const some = <A>(items: readonly A[], low: number, high: number): A[] => {
    const pool = [...items]
    const out: A[] = []
    for (let n = int(low, Math.min(high, pool.length)); n > 0; n--)
      out.push(...pool.splice(int(0, pool.length - 1), 1))
    return out
  }
  return { int, one, some, chance: (p) => next() < p }
}

interface RecommendOutput {
  readonly filmes?: ReadonlyArray<{ readonly id: string }>
  readonly sessao?: { readonly id: string }
}

/** The scenario's first step opened no Session (Python answered an error,
 * as when no film is left): the rest of the scenario does not run. */
export class NoSession extends Error {}

/** This step has nothing to act on (a redo with no film on screen to keep
 * or swap): it does not run, and the scenario goes on. */
export class SkipStep extends Error {}

/** The Session the scenario's first step opened, and its films now (the
 * last `recomendar` on it). */
const sessionOf = (outputs: readonly unknown[]): string => {
  const id = (outputs[0] as RecommendOutput | undefined)?.sessao?.id
  if (id === undefined) throw new NoSession()
  return id
}
const filmsOf = (outputs: readonly unknown[]): string[] => {
  for (let i = outputs.length - 1; i >= 0; i--) {
    const films = (outputs[i] as RecommendOutput | undefined)?.filmes
    if (Array.isArray(films)) return films.map((film) => film.id)
  }
  return []
}

/** Up to `n` films on screen from position `from` (moved back so `n` fit),
 * or `SkipStep` when the screen is empty. */
const someFilms = (outputs: readonly unknown[], from: number, n: number) => {
  const films = filmsOf(outputs)
  const start = Math.max(0, Math.min(from, films.length - n))
  const taken = films.slice(start, start + n)
  if (taken.length === 0) throw new SkipStep()
  return taken
}

const fixed = (argv: readonly string[]): PlannedStep => ({
  build: () => ({ argv, stdin: null }),
})

/** The read-only queries `consultar` runs on every run (catalog only: no
 * table of a Pessoa). */
export const QUERIES: readonly string[] = [
  'SELECT count(*) AS n FROM filmes',
  'SELECT id, titulo, ano, duracao_min, votos FROM filmes ORDER BY votos DESC, id LIMIT 20',
  'SELECT predicado, count(*) AS n FROM arestas GROUP BY predicado ORDER BY predicado',
  'SELECT genero, count(*) AS n FROM generos_imdb GROUP BY genero ORDER BY n DESC, genero LIMIT 30',
  'SELECT tag, count(*) AS n FROM tags_movielens GROUP BY tag ORDER BY n DESC, tag LIMIT 25',
  'SELECT filme_id, tag, relevancia FROM genoma WHERE relevancia > 0.99 ORDER BY filme_id, tag LIMIT 40',
  'SELECT avg(duracao_min) AS media, min(ano) AS primeiro, max(ano) AS ultimo FROM filmes',
  'SELECT f.titulo, count(a.fato_id) AS n FROM filmes f JOIN arestas a ON a.filme_id = f.id GROUP BY f.id ORDER BY n DESC, f.id LIMIT 10',
  'SELECT ln(2.0) AS l, round(1.0 / 3, 6) AS r',
  "SELECT id FROM filmes WHERE titulo LIKE 'The %' ORDER BY id LIMIT 15",
]

/** The plan: the `recomendar` scenarios, then `pessoa ver` for every
 * Pessoa, `consultar` and `sessoes-abertas`. */
export function plan(
  inputs: PlanInputs,
  options: PlanOptions,
): PlannedScenario[] {
  const pick = picker(random(options.seed))
  const count = options.count ?? 300
  const scenarios: PlannedScenario[] = []
  const pad = (n: number) => String(n).padStart(3, '0')
  for (let i = 0; i < count; i++) {
    const attendees = pick.some(inputs.people, 1, 3)
    // The Dono by its alias now and then, as the skill sends it.
    const named = pick.chance(0.15)
      ? attendees.map((slug) => (slug === inputs.owner ? 'dono' : slug))
      : attendees
    const rule = RULES[i % RULES.length] as (typeof RULES)[number]
    const argv = ['recomendar', '--presentes', ...named, '--quantos', '20']
    if (rule !== 'padrao' || pick.chance(0.3)) argv.push('--regra', rule)
    if (rule === 'de') argv.push('--de', pick.one(named))
    if (pick.chance(0.6))
      argv.push(
        '--clima',
        ...pick.some(
          pick.chance(0.1)
            ? [...inputs.moods, 'fora do vocabulário']
            : inputs.moods,
          1,
          2,
        ),
      )
    for (const r of RESTRICTION_SETS[i % RESTRICTION_SETS.length] ?? [])
      argv.push(...(RESTRICTIONS[r]?.[1](pick, inputs) ?? []))
    const steps: PlannedStep[] = [fixed(argv)]

    // A redo per tenth Session: keep two, then swap what is on screen.
    if (i % 10 === 0) {
      const keep = pick.int(0, 4)
      steps.push(
        {
          build: ({ outputs }) => ({
            argv: [
              'recomendar',
              '--presentes',
              ...named,
              '--sessao',
              sessionOf(outputs),
              '--manter',
              ...someFilms(outputs, keep, 2),
            ],
            stdin: null,
          }),
        },
        {
          build: ({ outputs }) => ({
            argv: [
              'recomendar',
              '--presentes',
              ...named,
              '--sessao',
              sessionOf(outputs),
              '--trocar',
              ...someFilms(outputs, 0, 5),
            ],
            stdin: null,
          }),
        },
      )
    }
    // `cartaz` and `verificar` on every opened Session: an answer built from
    // the Session, and the same answer with one Força changed.
    steps.push(
      {
        build: ({ outputs }) => ({
          argv: ['cartaz', '--sessao', sessionOf(outputs)],
          stdin: null,
        }),
      },
      ...[false, true].map((broken): PlannedStep => ({
        build: ({ outputs, work }) => {
          const id = sessionOf(outputs)
          const text = answerFromSession(
            readFileSync(join(work, 'dados', 'sessoes', `${id}.md`), 'utf8'),
            { broken },
          )
          return {
            argv: ['verificar', '--sessao', id, `--texto=${text}`],
            stdin: null,
          }
        },
      })),
    )
    if (i % 5 === 0) steps.push(fixed(['sessoes-abertas']))
    // Feedback on a third: a film from the screen (or from outside it, or
    // nothing), a Nota, a Relato and a comment.
    if (i % 3 === 0) {
      const how = pick.int(0, 9)
      const rater = pick.one(attendees)
      const other = attendees.find(
        (slug) => slug !== rater && slug !== inputs.owner,
      )
      const rating = pick.chance(0.5)
        ? String(pick.int(1, 10) / 2).replace('.', ',')
        : `${pick.int(1, 10)}/10`
      const level = pick.one(['gostou', 'neutro', 'não gostou'])
      const position = pick.int(0, 4)
      const outside = pick.one(inputs.references)
      steps.push({
        build: ({ outputs }) => {
          const films = filmsOf(outputs)
          const film =
            how === 0
              ? null
              : how === 1
                ? outside
                : (films[position] ?? films[0])
          return {
            argv: [
              'feedback',
              '--sessao',
              sessionOf(outputs),
              ...(film === null || film === undefined
                ? ['--nada']
                : ['--filme', film]),
              ...(film ? ['--nota', `${rater}=${rating}`] : []),
              ...(film && other ? ['--relato', `${other}=${level}`] : []),
              ...(film ? ['--comentario', `${rater}=achou o ritmo bom`] : []),
            ],
            stdin: null,
          }
        },
      })
    }
    scenarios.push({ id: `real/recomendar-${pad(i)}`, steps })
  }
  for (const [i, slug] of [...inputs.people, 'dono'].entries())
    scenarios.push({
      id: `real/pessoa-ver-${pad(i)}`,
      steps: [fixed(['pessoa', 'ver', slug])],
    })
  for (const [i, sql] of QUERIES.entries())
    scenarios.push({
      id: `real/consultar-${pad(i)}`,
      steps: [fixed(['consultar', sql])],
    })
  scenarios.push({
    id: 'real/sessoes-abertas-000',
    steps: [fixed(['sessoes-abertas'])],
  })
  return scenarios
}
