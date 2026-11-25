// The data versions and the dated report of an evaluation
// (`avaliacao/relatorio.py`). The prose stays Portuguese; the YAML blocks
// hold the result's sections with the output's English keys (the Python
// report dumped its Portuguese dict).

import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { pyFixed, pyRepr } from '../compat/number.ts'
import type { Measures } from './offline.ts'
import { dumpYaml, type ReportValue } from './yaml.ts'

const isFile = (path: string) => existsSync(path) && statSync(path).isFile()

const sha256 = (path: string) =>
  createHash('sha256').update(readFileSync(path)).digest('hex')

/** `versoes`: the sha256 of each Catalog CSV (and of the MovieLens files),
 * by path inside the Catalog; with the dumps (no `filmes.csv`), the pinned
 * manifest too. */
export const dataVersions = (
  catalog: string,
  manifest: string,
): Readonly<Record<string, unknown>> => {
  const files = [
    ...(existsSync(catalog) && statSync(catalog).isDirectory()
      ? readdirSync(catalog).filter((name) => name.endsWith('.csv'))
      : []),
    ...['links.csv', 'ratings.csv', 'tags.csv'].map((name) => `ml-32m/${name}`),
  ]
  const out: Record<string, unknown> = {}
  for (const file of files.sort())
    if (isFile(join(catalog, file))) out[file] = sha256(join(catalog, file))
  if (!isFile(join(catalog, 'filmes.csv')) && isFile(manifest))
    out['manifest'] = JSON.parse(readFileSync(manifest, 'utf8')) as unknown
  return out
}

/** What the report shows, the output's fields. */
export interface ReportContent {
  readonly date: string
  readonly offline: { readonly people: Measures; readonly movielens: Measures }
  readonly online: {
    readonly sessions: number
    readonly withFilm: number
    readonly rateTop5: number | null
    readonly meanReaction: number | null
  }
  readonly priority: string
  readonly weights: ReportValue
  readonly versions: ReportValue
  readonly movielensSample: { readonly seed: number; readonly users: number }
  readonly grid?: { readonly combinations: number; readonly best: ReportValue }
  readonly warnings: ReadonlyArray<string>
}

/** `_taxa`: `f"{valor:.1%}"`, or a dash. */
const rate = (value: number | null) =>
  value === null ? '—' : `${pyFixed(value * 100, 1)}%`

const yamlBlock = (value: ReportValue) => '```yaml\n' + dumpYaml(value) + '```'

/** The report's Markdown text (`gravar`, before the file). */
export const reportText = (r: ReportContent): string => {
  const lines = [
    `# Avaliação de ${r.date}`,
    '',
    '## Offline',
    '',
    '| Amostra | Pessoas | Recall@50 | Cobertura no top 5 |',
    '| --- | ---: | ---: | ---: |',
  ]
  for (const [name, m] of [
    ['Pessoas', r.offline.people],
    ['MovieLens', r.offline.movielens],
  ] as const)
    lines.push(
      `| ${name} | ${m.people} | ${rate(m.recall50)} ` +
        `(${m.retrieved}/${m.heldOut4Plus}) | ${rate(m.coverageTop5)} ` +
        `(${m.withEvidence}/${m.filmsTop5}) |`,
    )
  lines.push(
    '',
    'O corte retém os 20% mais recentes do histórico de cada Pessoa e de cada usuário sorteado.',
    `A amostra do MovieLens usou a semente ${r.movielensSample.seed} e sorteou ${r.movielensSample.users} usuários.`,
  )
  const online = r.online
  lines.push(
    '',
    '## Online',
    '',
    `- Sessões com Feedback na janela: ${online.sessions}`,
    `- Sessões em que viram um filme: ${online.withFilm}`,
    `- Filme escolhido no top 5: ${rate(online.rateTop5)}`,
    `- Reação média: ${online.meanReaction !== null ? pyRepr(online.meanReaction) : '—'}`,
    `- Medida que decide: ${r.priority}`,
    '',
    '## Pesos',
    '',
    yamlBlock(r.weights),
    '',
    '## Versões dos dados',
    '',
    yamlBlock(r.versions),
  )
  if (r.grid)
    lines.push(
      '',
      '## Grade de pesos',
      '',
      `Foram testados ${r.grid.combinations} conjuntos. A ordem usa a média do Recall@50 ` +
        'entre as amostras. No empate, vale a cobertura no top 5 e depois o menor número ' +
        'de mudanças nos pesos.',
      '',
      yamlBlock(r.grid.best),
    )
  if (r.warnings.length > 0)
    lines.push('', '## Avisos', '', ...r.warnings.map((w) => `- ${w}`))
  return lines.join('\n') + '\n'
}

/** Writes `<folder>/<date>.md` atomically (temp file and rename) and gives
 * its path. */
export const writeReport = (folder: string, content: ReportContent): string => {
  mkdirSync(folder, { recursive: true })
  const target = join(folder, `${content.date}.md`)
  const temporary = join(
    folder,
    `.${content.date}.${randomBytes(6).toString('hex')}.tmp`,
  )
  try {
    writeFileSync(temporary, reportText(content))
    renameSync(temporary, target)
  } finally {
    rmSync(temporary, { force: true })
  }
  return target
}
