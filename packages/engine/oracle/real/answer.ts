// An answer in the skill's line format, built from a Session file (Python's,
// in Portuguese), for the real run's `verificar` steps: every film title as
// `**N. Título** (ano, duração)` and every Evidence as
// `- **Rótulo:** texto (fonte) *(força, tipo)*`, which is what the verifier
// accepts. `broken` changes the first Evidence's Força and adds a line no
// Session has, so the invalid path runs too. Only the first `films` (5, as
// the skill shows) and at most `evidence` lines per Presente and film (the
// skill picks one per Presente): a real Session lists hundreds per film, and
// the answer goes in one argument (`--texto=...`), which Linux caps at
// 128 KiB (E2BIG).

import { parse } from 'yaml'

const STRENGTHS = ['forte', 'moderada', 'fraca'] as const
/** A film with only guesses ends its title line with this. */
const GUESS_MARK = 'sem fato que o sustente'

/** One Evidence line of the body (`     - Evidência: ...`) as the answer
 * writes it, or undefined when the line has no Força and Tipo. */
function summary(line: string): string | undefined {
  const typeAt = line.lastIndexOf(' · Tipo: ')
  if (typeAt === -1) return undefined
  const kind = line.slice(typeAt + ' · Tipo: '.length)
  const strengthAt = line.lastIndexOf(' · Força: ', typeAt)
  if (strengthAt === -1) return undefined
  const strength = line.slice(strengthAt + ' · Força: '.length, typeAt)
  let text = line.slice(0, strengthAt)
  const sourceAt = text.lastIndexOf(' · Fonte: ')
  if (kind !== 'palpite' && sourceAt !== -1)
    text = `${text.slice(0, sourceAt)} (${text.slice(sourceAt + ' · Fonte: '.length)})`
  return `${text} *(${strength}, ${kind})*`
}

export function answerFromSession(
  file: string,
  options: {
    readonly broken?: boolean
    readonly films?: number
    readonly evidence?: number
  } = {},
): string {
  const front = /^---\n([\s\S]*?\n)---\n/.exec(file)
  const body = file.slice(front?.[0].length ?? 0)
  const titles = new Map<string, string>()
  const parsed = parse(front?.[1] ?? '', { version: '1.1' }) as {
    readonly recomendacao?: ReadonlyArray<{ posicao: number; titulo: string }>
  } | null
  for (const film of parsed?.recomendacao ?? [])
    titles.set(String(film.posicao), film.titulo)
  const out: string[] = ['Você e companhia, para hoje.', '']
  let label = ''
  let broken = options.broken ?? false
  const films = options.films ?? 5
  const evidence = options.evidence ?? 3
  let written = 0
  for (const line of body.split('\n')) {
    const position = /^(\d+)\. /.exec(line)?.[1]
    const title = position === undefined ? undefined : titles.get(position)
    if (title !== undefined) {
      if (Number(position) > films) break
      written = 0
      const head = `${position}. ${title}`
      const end = line.lastIndexOf(' · tt')
      const guess = line.endsWith(` · ${GUESS_MARK}`) ? ` — ${GUESS_MARK}` : ''
      out.push(
        '',
        `**${head}**${line.slice(head.length, end === -1 ? undefined : end)}${guess}`,
      )
      continue
    }
    if (line.startsWith('   - ') && !line.startsWith('   - Evidência')) {
      label = line.slice('   - '.length)
      written = 0
      continue
    }
    if (!line.startsWith('     - Evidência: ') || written >= evidence) continue
    let text = summary(line.slice('     - Evidência: '.length))
    if (text === undefined) continue
    if (broken) {
      const strength = STRENGTHS.find((s) => text?.includes(`*(${s}, `))
      const other = STRENGTHS.find((s) => s !== strength) ?? 'forte'
      if (strength) text = text.replace(`*(${strength}, `, `*(${other}, `)
      out.push(
        `- **${label}:** ${text}`,
        `- **${label}:** viu no cinema ontem *(forte, nota)*`,
      )
      broken = false
      written++
      continue
    }
    out.push(`- **${label}:** ${text}`)
    written++
  }
  out.push('', 'Depois, me conte o que viram e como foi.')
  return out.join('\n')
}
