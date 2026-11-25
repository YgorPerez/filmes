// The real-database run (#84): the seeded plan, the verifier answer it
// builds, the report that leaves the Pessoas out, the §4.4 tolerance, and
// one whole run with the fixture standing in for the real files (Python
// for real, through `uv`).

import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, test } from 'vite-plus/test'
import { ROOT } from '../../oracle/paths.ts'
import { pythonEnv, resolvePython, runPython } from '../../oracle/python.ts'
import { answerFromSession } from '../../oracle/real/answer.ts'
import { dataTables } from '../../oracle/real/lane.ts'
import {
  plan,
  RESTRICTION_SETS,
  SkipStep,
  type PlanInputs,
  type PlannedStep,
} from '../../oracle/real/plan.ts'
import { anonymiser, formatRealReport } from '../../oracle/real/report.ts'
import { readLocalToml, runReal } from '../../oracle/real/run.ts'
import { compareDatabases } from '../../oracle/state.ts'

const INPUTS: PlanInputs = {
  people: ['iara', 'teo', 'bruno', 'lia'],
  owner: 'bruno',
  moods: ['leve', 'tenso'],
  references: ['tt1', 'tt2', 'tt3'],
}

const argvs = (seed: number, count: number) =>
  plan(INPUTS, { seed, count }).map(
    (scenario) => scenario.steps[0]?.build({ outputs: [], work: '' }).argv,
  )

describe('plan', () => {
  test('the same seed gives the same requests, another seed others', () => {
    expect(argvs(7, 40)).toEqual(argvs(7, 40))
    expect(argvs(8, 40)).not.toEqual(argvs(7, 40))
  })

  test('every Regra, no Restrição, each alone and each pair', () => {
    const scenarios = plan(INPUTS, { seed: 1, count: RESTRICTION_SETS.length })
    const first = scenarios
      .filter((s) => s.id.startsWith('real/recomendar-'))
      .map((s) => s.steps[0]?.build({ outputs: [], work: '' }).argv ?? [])
    expect(RESTRICTION_SETS).toHaveLength(1 + 10 + 45)
    const flags = (argv: readonly string[]) =>
      argv
        .filter((arg) => arg.startsWith('--'))
        .filter(
          (arg) =>
            ![
              '--presentes',
              '--quantos',
              '--regra',
              '--de',
              '--clima',
            ].includes(arg),
        )
    expect(first.map(flags)).toContainEqual([])
    expect(first.map(flags)).toContainEqual(['--sem-lento'])
    expect(first.map(flags)).toContainEqual(['--sem-tristeza', '--parecido'])
    expect(
      new Set(
        first.map((argv) =>
          argv.includes('--regra')
            ? argv[argv.indexOf('--regra') + 1]
            : 'padrao',
        ),
      ),
    ).toEqual(new Set(['padrao', 'media', 'de']))
    expect(first.every((argv) => argv.includes('20'))).toBe(true)
  })

  test('the ids name no Pessoa', () => {
    const ids = plan(INPUTS, { seed: 3, count: 20 }).map((s) => s.id)
    expect(ids.some((id) => /iara|teo|bruno|lia/.test(id))).toBe(false)
    expect(ids).toContain('real/pessoa-ver-004')
  })

  test('Feedback names only Presentes, and "desde" comes before "ate"', () => {
    const output = { sessao: { id: 's' }, filmes: [{ id: 'tt9' }] }
    const strays = plan(INPUTS, { seed: 7, count: 150 }).flatMap((scenario) => {
      const first = scenario.steps[0]?.build({ outputs: [], work: '' }).argv
      const present = new Set(
        (first ?? [])
          .slice(2, (first ?? []).indexOf('--quantos'))
          .map((slug) => (slug === 'dono' ? INPUTS.owner : slug)),
      )
      return scenario.steps
        .slice(1)
        .flatMap((step) => {
          try {
            return [step.build({ outputs: [output], work: '' }).argv]
          } catch {
            return []
          }
        })
        .filter((argv) => argv[0] === 'feedback')
        .flatMap((argv) =>
          argv.filter((_, i) =>
            ['--nota', '--relato'].includes(argv[i - 1] ?? ''),
          ),
        )
        .map((arg) => arg.split('=')[0])
        .filter((slug) => !present.has(slug))
    })
    expect(strays).toEqual([])
    const years = plan(INPUTS, { seed: 7, count: 150 })
      .map(
        (scenario) =>
          scenario.steps[0]?.build({ outputs: [], work: '' }).argv ?? [],
      )
      .filter((argv) => argv.includes('--desde') && argv.includes('--ate'))
      .map((argv) => [
        Number(argv[argv.indexOf('--desde') + 1]),
        Number(argv[argv.indexOf('--ate') + 1]),
      ])
    expect(years.length).toBeGreaterThan(0)
    expect(years.filter(([from, to]) => (from ?? 0) > (to ?? 0))).toEqual([])
  })

  test('a redo with no film on screen is skipped', () => {
    const scenario = plan(INPUTS, { seed: 1, count: 1 })[0]
    const redo = scenario?.steps[1]
    expect(redo).toBeDefined()
    expect(() =>
      redo?.build({ outputs: [{ sessao: { id: 's' }, filmes: [] }], work: '' }),
    ).toThrow(SkipStep)
  })

  test('a Relato is never about the Dono, and "nada" takes no reaction', () => {
    // The `verificar` steps read the Session file, which is not there.
    const built = (step: PlannedStep): readonly string[] => {
      try {
        return step.build({
          outputs: [{ sessao: { id: 's' }, filmes: [{ id: 'tt9' }] }],
          work: '',
        }).argv
      } catch {
        return []
      }
    }
    const feedback = plan(INPUTS, { seed: 5, count: 120 })
      .flatMap((scenario) => scenario.steps.slice(1).map(built))
      .filter((argv) => argv[0] === 'feedback')
    expect(feedback).toHaveLength(40)
    const about = feedback.flatMap((argv) =>
      argv.flatMap((arg, i) => (argv[i - 1] === '--relato' ? [arg] : [])),
    )
    expect(about.length).toBeGreaterThan(0)
    expect(about.filter((arg) => arg.startsWith('bruno='))).toEqual([])
    expect(
      feedback.filter((argv) => argv.includes('--nada') && argv.length !== 4),
    ).toEqual([])
    expect(feedback.some((argv) => argv.includes('--nada'))).toBe(true)
  })
})

const SESSION = `---
data: 2026-11-20
recomendacao:
- {posicao: 1, id: tt9001101, titulo: Dia de Feira (Parte 2)}
- {posicao: 2, id: tt9001106, titulo: Sessão Maldita}
---
## Recomendação

1. Dia de Feira (Parte 2) (2016, 1h34) · tt9001101
   - Bruno
     - Evidência: deu 5 a O Farol de Areia (2012) · Fonte: MovieLens ml-32m, 2023-10-13 · Força: fraca · Tipo: review
   - Teo
     - Evidência: sem fato · Força: fraca · Tipo: palpite
2. Sessão Maldita (2005, 1h26) · tt9001106 · sem fato que o sustente
   - Filme
     - Evidência: duração 1h26 · Fonte: IMDb · Força: forte · Tipo: metadado
`

describe('answerFromSession', () => {
  test('titles and Evidence lines in the format the verifier reads', () => {
    expect(answerFromSession(SESSION).split('\n')).toEqual([
      'Você e companhia, para hoje.',
      '',
      '',
      '**1. Dia de Feira (Parte 2)** (2016, 1h34)',
      '- **Bruno:** deu 5 a O Farol de Areia (2012) (MovieLens ml-32m, 2023-10-13) *(fraca, review)*',
      '- **Teo:** sem fato *(fraca, palpite)*',
      '',
      '**2. Sessão Maldita** (2005, 1h26) — sem fato que o sustente',
      '- **Filme:** duração 1h26 (IMDb) *(forte, metadado)*',
      '',
      'Depois, me conte o que viram e como foi.',
    ])
  })

  test('only the first films', () => {
    const text = answerFromSession(SESSION, { films: 1 })
    expect(text).toContain('**1. Dia de Feira (Parte 2)**')
    expect(text).not.toContain('Sessão Maldita')
  })

  test('at most `evidence` lines per Presente and film', () => {
    const many = SESSION.replace(
      '   - Teo\n',
      `${'     - Evidência: deu 4 a Outro (2001) · Fonte: Letterboxd, 2025-01-01 · Força: moderada · Tipo: nota\n'.repeat(3)}   - Teo\n`,
    )
    const lines = answerFromSession(many, { evidence: 2 }).split('\n')
    expect(
      lines.filter((line) => line.startsWith('- **Bruno:**')),
    ).toHaveLength(2)
    expect(lines).toContain('- **Teo:** sem fato *(fraca, palpite)*')
    expect(lines).toContain(
      '- **Filme:** duração 1h26 (IMDb) *(forte, metadado)*',
    )
  })

  test('broken: the first Força changes and a made-up line follows', () => {
    const lines = answerFromSession(SESSION, { broken: true }).split('\n')
    expect(lines[4]).toBe(
      '- **Bruno:** deu 5 a O Farol de Areia (2012) (MovieLens ml-32m, 2023-10-13) *(forte, review)*',
    )
    expect(lines[5]).toBe('- **Bruno:** viu no cinema ontem *(forte, nota)*')
    expect(lines[6]).toBe('- **Teo:** sem fato *(fraca, palpite)*')
  })
})

describe('report', () => {
  test('names, slugs and aliases go, whole words in any case', () => {
    const { clean, leaks } = anonymiser(['iara', 'Bruno Souza'])
    expect(clean('output.films[0].utility.iara')).toBe(
      'output.films[0].utility.<pessoa>',
    )
    expect(clean('data/sessions/2026-11-20-IARA-teo.md')).toBe(
      'data/sessions/2026-11-20-<pessoa>-teo.md',
    )
    expect(clean('a bruno souza b')).toBe('a <pessoa> b')
    expect(leaks('tiara')).toBe(false)
    expect(leaks('com Iara')).toBe(true)
  })

  test('the Markdown groups paths without values and refuses a leak', () => {
    const facts = {
      seed: 1,
      today: '2026-11-20',
      scenarios: 1,
      people: 1,
      sessionsInData: 0,
      films: 80,
      dataTables: ['pessoas'],
      keys: [],
      cacheBefore: {},
      fetched: {},
      stopped: 0,
      seconds: 60,
    }
    const report = {
      scenarios: 1,
      steps: 2,
      compared: { recomendar: 2 },
      notPorted: {},
      explained: {},
      stale: [],
      errors: [],
      ok: false,
      unexplained: [0, 1].map((i) => ({
        check: 'parity' as const,
        path: `output.films[${i}].utility.iara`,
        python: 'secret text about iara',
        ts: 0.5,
        scenario: 'real/recomendar-000',
        step: i,
        command: 'recomendar',
      })),
    }
    const text = formatRealReport({
      facts,
      report,
      private: ['iara'],
      commit: 'abc',
      lanes: 1,
      ranOn: '2026-11-25',
    })
    expect(text).toContain(
      '| parity | recomendar | `output.films[*].utility.<pessoa>` | 2 | real/recomendar-000 step 1; real/recomendar-000 step 2 |',
    )
    expect(text).not.toContain('secret')
    expect(() =>
      formatRealReport({
        facts: { ...facts, dataTables: ['iara'] },
        report,
        private: ['iara'],
        commit: 'abc',
        lanes: 1,
        ranOn: '2026-11-25',
      }),
    ).toThrow(/names a Pessoa/)
  })
})

describe('compareDatabases tolerance (#76 §4.4)', () => {
  let dir: string
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'filmes-tolerance-'))
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  const database = (name: string, valor: number, other: number) => {
    const file = join(dir, `${name}.sqlite`)
    const db = new DatabaseSync(file)
    db.exec(
      'CREATE TABLE tags_no_catalogo (tag TEXT, valor REAL); CREATE TABLE genoma (tag TEXT, relevancia REAL)',
    )
    db.prepare('INSERT INTO tags_no_catalogo VALUES (?, ?)').run('a', valor)
    db.prepare('INSERT INTO genoma VALUES (?, ?)').run('a', other)
    db.close()
    return file
  }
  const same = { python: (t: string) => t, ts: (t: string) => t }

  test('1e-12 relative on exactly the two columns, exact elsewhere', () => {
    const x = Math.log(7)
    const ulp = x * (1 + Number.EPSILON)
    const python = database('python', x, 0.25)
    expect(
      compareDatabases(python, database('ulp', ulp, 0.25), 'parity', same),
    ).toEqual([])
    expect(
      compareDatabases(
        python,
        database('far', x * (1 + 1e-9), 0.25),
        'parity',
        same,
      ).map((d) => d.path),
    ).toEqual(['db/tags_no_catalogo', 'db/tags_no_catalogo'])
    expect(
      compareDatabases(
        python,
        database('other', x, 0.25 * (1 + Number.EPSILON)),
        'parity',
        same,
      ).map((d) => d.path),
    ).toEqual(['db/genoma', 'db/genoma'])
    expect(
      compareDatabases(python, database('only', x, 0.3), 'parity', same, [
        'tags_no_catalogo',
      ]),
    ).toEqual([])
  })
})

describe('runReal on the fixture', () => {
  let scratch: string
  beforeAll(async () => {
    scratch = mkdtempSync(join(tmpdir(), 'filmes-real-test-'))
    cpSync(join(ROOT, 'tests/fixture/dados'), join(scratch, 'dados'), {
      recursive: true,
    })
    const built = await runPython(
      resolvePython(),
      ['reconstruir'],
      null,
      pythonEnv(
        {
          FILMES_DADOS: join(scratch, 'dados'),
          FILMES_BANCO: join(scratch, 'filmes.sqlite'),
          FILMES_CATALOGO: join(ROOT, 'tests/fixture/catalogo'),
          FILMES_HOJE: '2026-11-20',
          FILMES_LOCAL: join(scratch, 'none.toml'),
        },
        0,
      ),
    )
    if (built.exitCode !== 0)
      throw new Error(
        `fixture reconstruir failed: ${JSON.stringify(built.output)}`,
      )
    writeFileSync(
      join(scratch, 'local.toml'),
      `[caminhos]\nbanco = "${join(scratch, 'filmes.sqlite')}"\ndados = "${join(scratch, 'dados')}"\n`,
    )
  })
  afterAll(() => rmSync(scratch, { recursive: true, force: true }))

  test('the data tables are those filmes-dados loads', () => {
    expect(dataTables()).toEqual(
      expect.arrayContaining(['pessoas', 'notas', 'sessoes', 'reacoes']),
    )
    expect(dataTables()).not.toContain('filmes')
    expect(dataTables()).not.toContain('slugs_letterboxd')
  })

  test(
    'both engines agree, the verifier sees good and broken answers, nothing is fetched',
    { timeout: 300_000 },
    async () => {
      const { report, results, facts } = await runReal({
        python: resolvePython(),
        source: readLocalToml(join(scratch, 'local.toml')),
        work: join(scratch, 'work'),
        seed: 2,
        count: 4,
        today: '2026-11-20',
        lanes: 2,
      })
      expect(report.unexplained).toEqual([])
      expect(report.errors).toEqual([])
      expect(report.ok).toBe(true)
      expect(report.compared['recomendar']).toBeGreaterThanOrEqual(4)
      expect(report.notPorted).toEqual({ cartaz: 4 })
      const verdicts = results
        .flatMap((r) => r.steps)
        .filter((s) => s.command === 'verificar')
        .map(
          (s) => (s.python?.output as { valida?: boolean } | undefined)?.valida,
        )
      expect(verdicts).toContain(true)
      expect(verdicts).toContain(false)
      expect(facts.fetched).toEqual({})
      expect(facts.people).toBe(5)
    },
  )
})
