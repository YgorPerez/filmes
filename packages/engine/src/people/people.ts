// The Pessoas of filmes-dados: one file `people/<slug>.md` each
// (`filmes/dados/pessoas.py`). Read them all, find one by slug, name or
// alias, create one, and write one back.
//
// Every message is the Python engine's, word for word (a key is named as the Portuguese file had it). Two point at
// something else in an English file: the link and level hints list the
// English values, and a body line names `people/<slug>.md`.

import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { Effect } from 'effect'
import { pyInt } from '../compat/fact-id.ts'
import { isIsoDate } from '../compat/parse.ts'
import { casefold, personSlug, pyStrip } from '../compat/text.ts'
import { parseMarkdown, readMarkdown, writeMarkdown } from '../data/markdown.ts'
import {
  isMapping,
  isPyInt,
  isSequence,
  pyIterate,
  pyReprValue,
  pyStrValue,
  pyTruthy,
  type YamlMapping,
  type YamlValue,
} from '../data/yaml.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import { Environment } from '../runtime/Environment.ts'
import { Owner } from '../runtime/Owner.ts'
import {
  LEVELS,
  LINKS,
  sameQuestion,
  SETUP_STEPS,
  type SetupStep,
  SKIPS_TO_DROP,
  type Adjustment,
  type OpenQuestion,
  type Person,
  type Veto,
} from './Person.ts'

const invalid = (message: string) => engineError('invalid_data', message)

/** The `people/` folder of filmes-dados; a missing filmes-dados is
 * `missing_data`. */
export const peopleFolder: Effect.Effect<string, EngineError, Environment> =
  Effect.gen(function* () {
    const env = yield* Environment
    const root = yield* env.path('data')
    const isDir = yield* Effect.sync(
      () => existsSync(root) && statSync(root).isDirectory(),
    )
    if (!isDir)
      return yield* engineError(
        'missing_data',
        `repo de dados não encontrado em ${root}`,
      )
    return join(root, 'people')
  })

/** Code point order, as Python sorts str and paths. */
const byCodePoint = (a: string, b: string): number => {
  const x = Array.from(a)
  const y = Array.from(b)
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = (x[i]?.codePointAt(0) ?? 0) - (y[i]?.codePointAt(0) ?? 0)
    if (d !== 0) return d
  }
  return x.length - y.length
}

const field = (map: YamlMapping, key: string): YamlValue | undefined =>
  map.get(key)

/** `item.get(key)` of a mapping item, after `isinstance(item, dict)`. */
const has = (item: YamlMapping, keys: readonly string[]) =>
  keys.every((key) => pyTruthy(item.get(key)))

const validDate = (value: YamlValue | undefined) =>
  value !== undefined && isIsoDate(pyStrValue(value))

const decodeVeto = (
  file: string,
  item: YamlValue,
): Effect.Effect<Veto, EngineError> => {
  if (!isMapping(item) || !has(item, ['text', 'target', 'date']))
    return Effect.fail(
      invalid(
        `${file}: Veto precisa de texto, alvo e data: ${pyReprValue(item)}`,
      ),
    )
  const date = item.get('date') ?? null
  if (!validDate(date))
    return Effect.fail(
      invalid(`${file}: data do Veto inválida: ${pyReprValue(date)}`),
    )
  const target = pyStrValue(item.get('target') ?? null)
  const label = item.get('label')
  return Effect.succeed({
    text: pyStrValue(item.get('text') ?? null),
    target,
    label: pyTruthy(label) && label !== undefined ? pyStrValue(label) : target,
    date: pyStrValue(date),
  })
}

const isLink = (value: YamlValue | undefined): value is Adjustment['link'] =>
  typeof value === 'string' && (LINKS as readonly string[]).includes(value)

const isLevel = (value: YamlValue | undefined): value is Adjustment['level'] =>
  typeof value === 'string' &&
  value !== 'normal' &&
  (LEVELS as readonly string[]).includes(value)

const decodeAdjustments = (
  file: string,
  list: readonly YamlValue[],
): Effect.Effect<Adjustment[], EngineError> =>
  Effect.suspend(() => {
    const adjustments: Adjustment[] = []
    for (const item of list) {
      if (!isMapping(item) || !has(item, ['link', 'level', 'date']))
        return Effect.fail(
          invalid(
            `${file}: Ajuste precisa de elo, nivel e data: ${pyReprValue(item)}`,
          ),
        )
      const link = item.get('link')
      const level = item.get('level')
      const date = item.get('date')
      if (!isLink(link))
        return Effect.fail(
          invalid(
            `${file}: elo do Ajuste inválido: ${pyReprValue(link ?? null)} (use ${LINKS.join(', ')})`,
          ),
        )
      if (!isLevel(level))
        return Effect.fail(
          invalid(
            `${file}: nível do Ajuste inválido: ${pyReprValue(level ?? null)} (use none, low ou high)`,
          ),
        )
      if (!validDate(date))
        return Effect.fail(
          invalid(
            `${file}: data do Ajuste inválida: ${pyReprValue(date ?? null)}`,
          ),
        )
      if (adjustments.some((a) => a.link === link))
        return Effect.fail(
          invalid(`${file}: mais de um Ajuste para o elo ${link}`),
        )
      adjustments.push({ link, level, date: pyStrValue(date ?? null) })
    }
    return Effect.succeed(adjustments)
  })

const decodeOpenQuestions = (
  file: string,
  list: readonly YamlValue[],
): Effect.Effect<OpenQuestion[], EngineError> =>
  Effect.suspend(() => {
    const questions: OpenQuestion[] = []
    for (const item of list) {
      if (!isMapping(item) || !has(item, ['text', 'date', 'skips']))
        return Effect.fail(
          invalid(
            `${file}: pergunta aberta precisa de texto, data e puladas: ${pyReprValue(item)}`,
          ),
        )
      const date = item.get('date')
      if (!validDate(date))
        return Effect.fail(
          invalid(
            `${file}: data da pergunta aberta inválida: ${pyReprValue(date ?? null)}`,
          ),
        )
      const skips = item.get('skips') ?? null
      const count = isPyInt(skips) ? Number(skips.int) : Number.NaN
      if (!(count >= 1 && count < SKIPS_TO_DROP))
        return Effect.fail(
          invalid(
            `${file}: puladas da pergunta aberta inválido: ${pyReprValue(skips)} ` +
              `(de 1 a ${SKIPS_TO_DROP - 1}; pulada ${SKIPS_TO_DROP} vezes, sai)`,
          ),
        )
      const subjectValue = item.get('subject')
      const subject =
        subjectValue !== undefined && pyTruthy(subjectValue)
          ? pyStrValue(subjectValue)
          : null
      const labelValue = item.get('label')
      const question: OpenQuestion = {
        text: pyStrValue(item.get('text') ?? null),
        date: pyStrValue(date ?? null),
        skips: count,
        subject,
        label:
          subject === null
            ? null
            : labelValue !== undefined && pyTruthy(labelValue)
              ? pyStrValue(labelValue)
              : subject,
      }
      if (questions.some((q) => sameQuestion(q, question)))
        return Effect.fail(
          invalid(
            `${file}: pergunta aberta repetida: ${pyReprValue(item.get('text') ?? null)}`,
          ),
        )
      questions.push(question)
    }
    return Effect.succeed(questions)
  })

const isSetupStep = (value: YamlValue): value is SetupStep =>
  typeof value === 'string' &&
  (SETUP_STEPS as readonly string[]).includes(value)

/** The setup guide's skipped steps; one that is not a step is
 * `invalid_data`, and a repeated one counts once. */
const decodeSkippedSetup = (
  file: string,
  list: readonly YamlValue[],
): Effect.Effect<SetupStep[], EngineError> =>
  Effect.suspend(() => {
    const steps: SetupStep[] = []
    for (const item of list) {
      if (!isSetupStep(item))
        return Effect.fail(
          invalid(
            `${file}: passo pulado inválido: ${pyReprValue(item)} (use ${SETUP_STEPS.join(', ')})`,
          ),
        )
      if (!steps.includes(item)) steps.push(item)
    }
    return Effect.succeed(steps)
  })

/** `frente.get(key) or []`, iterated as Python would. */
const listOf = (map: YamlMapping, key: string): readonly YamlValue[] => {
  const value = field(map, key)
  return value !== undefined && pyTruthy(value) ? pyIterate(value) : []
}

/** A Pessoa from the parts of her file (`pessoas._ler`). `file` names
 * the file in the errors and gives the slug. */
const decodeParts = (
  file: string,
  frontmatter: YamlValue,
  body: string,
): Effect.Effect<Person, EngineError> =>
  Effect.gen(function* () {
    if (!isMapping(frontmatter)) {
      // Python's `"nome" not in frente` on a list or a str; anything else
      // has no `.get`.
      const named = isSequence(frontmatter)
        ? frontmatter.includes('name')
        : typeof frontmatter === 'string' && frontmatter.includes('name')
      if (
        !named &&
        (isSequence(frontmatter) || typeof frontmatter === 'string')
      )
        return yield* invalid(`${file}: falta o campo nome`)
      return yield* Effect.die(
        new TypeError(`the frontmatter of ${file} is not a mapping`),
      )
    }
    const name = frontmatter.get('name')
    if (name === undefined) return yield* invalid(`${file}: falta o campo nome`)
    const email = frontmatter.get('email')
    const vetoes: Veto[] = []
    for (const item of listOf(frontmatter, 'vetoes'))
      vetoes.push(yield* decodeVeto(file, item))
    return {
      slug: basename(file, '.md'),
      name: pyStrValue(name),
      aliases: listOf(frontmatter, 'aliases').map(pyStrValue),
      owner: pyTruthy(frontmatter.get('owner')),
      email: email === undefined || email === null ? null : pyStrValue(email),
      admin: pyTruthy(frontmatter.get('admin')),
      vetoes,
      adjustments: yield* decodeAdjustments(
        file,
        listOf(frontmatter, 'adjustments'),
      ),
      openQuestions: yield* decodeOpenQuestions(
        file,
        listOf(frontmatter, 'open_questions'),
      ),
      imports: listOf(frontmatter, 'imports'),
      skippedSetup: yield* decodeSkippedSetup(
        file,
        listOf(frontmatter, 'skipped_setup'),
      ),
      body,
    }
  })

/** A Pessoa from the text of her file. `file` names the file in the
 * errors and gives the slug. */
export const decodePerson = (
  file: string,
  text: string,
): Effect.Effect<Person, EngineError> =>
  Effect.flatMap(parseMarkdown(file, text), ({ frontmatter, body }) =>
    decodeParts(file, frontmatter, body),
  )

/** `decodePerson` for a caller that does not run Effect (the login's Dono
 * lookup): the Pessoa, or the `EngineError` thrown. */
export const decodePersonSync = (file: string, text: string): Person =>
  Effect.runSync(decodePerson(file, text))

/** A Pessoa's file, read. */
export const readPerson = (file: string): Effect.Effect<Person, EngineError> =>
  Effect.flatMap(readMarkdown(file), ({ frontmatter, body }) =>
    decodeParts(file, frontmatter, body),
  )

/** The frontmatter `pessoas.salvar` writes, in its order. */
export const encodePerson = (person: Person): YamlMapping => {
  const front = new Map<string, YamlValue>([
    ['name', person.name],
    ['aliases', [...person.aliases]],
  ])
  if (person.owner) front.set('owner', true)
  if (person.email !== null) front.set('email', person.email)
  if (person.admin) front.set('admin', true)
  front.set(
    'vetoes',
    person.vetoes.map(
      (v) =>
        new Map<string, YamlValue>([
          ['text', v.text],
          ['target', v.target],
          ['label', v.label],
          ['date', v.date],
        ]),
    ),
  )
  if (person.adjustments.length > 0)
    front.set(
      'adjustments',
      person.adjustments.map(
        (a) =>
          new Map<string, YamlValue>([
            ['link', a.link],
            ['level', a.level],
            ['date', a.date],
          ]),
      ),
    )
  if (person.openQuestions.length > 0)
    front.set(
      'open_questions',
      person.openQuestions.map((q) => {
        const item = new Map<string, YamlValue>([['text', q.text]])
        if (q.subject) {
          item.set('subject', q.subject)
          item.set('label', q.label)
        }
        item.set('date', q.date)
        item.set('skips', pyInt(q.skips))
        return item
      }),
    )
  front.set('imports', [...person.imports])
  if (person.skippedSetup.length > 0)
    front.set('skipped_setup', [...person.skippedSetup])
  return front
}

/** Every Pessoa, by file name (`pessoas.ler_todas`). Several may be Donos
 * (#131): each logs in to the app and the MCP with her own email. */
export const readPeople: Effect.Effect<
  readonly Person[],
  EngineError,
  Environment
> = Effect.gen(function* () {
  const folder = yield* peopleFolder
  const files = yield* Effect.sync(() =>
    existsSync(folder)
      ? readdirSync(folder)
          .filter((name) => name.endsWith('.md'))
          .sort(byCodePoint)
      : [],
  )
  return yield* Effect.forEach(files, (name) => readPerson(join(folder, name)))
})

/** The Pessoa by slug, name or alias, ignoring case (`pessoas.resolver`).
 * "dono" is the request's Dono: the logged-in Pessoa (`Owner`), or, with no
 * login (the CLI, the oracle), the first Dono by slug, as `ownerOf`. */
export const resolvePerson = (
  name: string,
): Effect.Effect<Person, EngineError, Environment> =>
  Effect.gen(function* () {
    const wanted = casefold(pyStrip(name))
    const people = yield* readPeople
    let found: readonly Person[]
    if (wanted === 'dono') {
      const owner = yield* Owner
      const donos = people.filter((p) =>
        owner === null ? p.owner : p.slug === owner,
      )
      if (donos.length === 0)
        return yield* engineError(
          'unknown_person',
          'nenhuma Pessoa tem dono: true no repo de dados',
        )
      found = donos.slice(0, 1)
    } else
      found = people.filter((p) =>
        [p.slug, p.name, ...p.aliases].some((n) => casefold(n) === wanted),
      )
    const [first, ...others] = found
    if (first === undefined)
      return yield* engineError(
        'unknown_person',
        `nenhuma Pessoa se chama '${name}'`,
      )
    if (others.length > 0)
      return yield* engineError(
        'ambiguous_person',
        `'${name}' pode ser mais de uma Pessoa: ${found.map((p) => p.slug).join(', ')}`,
      )
    return first
  })

export interface NewPerson {
  readonly name: string
  readonly aliases?: readonly string[]
  /** From the name when missing. */
  readonly slug?: string
  readonly owner?: boolean
  /** A Dono's Google e-mail, for the login; stored in lower case. */
  readonly email?: string
}

/** A Dono logs in with her Google e-mail, so she needs one; nobody else
 * has one. Lower case, as the login compares it, and nobody else's: two
 * Donos with one address would lock both out. */
const newOwnerEmail = (
  input: NewPerson,
): Effect.Effect<string | null, EngineError, Environment> =>
  Effect.gen(function* () {
    const email = input.email?.trim().toLowerCase() || null
    if (!input.owner)
      return email === null
        ? null
        : yield* engineError(
            'invalid_usage',
            'só um Dono tem e-mail: ele serve para entrar no site',
            'email_not_owner',
          )
    if (email === null)
      return yield* engineError(
        'invalid_usage',
        'um Dono precisa do e-mail do Google, para entrar no site',
        'email_required',
      )
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return yield* engineError(
        'invalid_usage',
        `e-mail inválido: '${email}'`,
        'invalid_email',
      )
    const holder = (yield* readPeople).find(
      (p) => p.email?.toLowerCase() === email,
    )
    if (holder !== undefined)
      return yield* engineError(
        'invalid_usage',
        `o e-mail '${email}' já é de ${holder.slug}`,
        'email_taken',
      )
    return email
  })

/** Fails when one of the new Pessoa's names (slug, name, aliases) already
 * finds another Pessoa, compared as `resolvePerson` compares: a request by
 * that name would no longer know whom it means. */
const nameFree = (
  names: readonly string[],
): Effect.Effect<void, EngineError, Environment> =>
  Effect.gen(function* () {
    const people = yield* readPeople
    for (const name of names.map(pyStrip)) {
      const holder = people.find((p) =>
        [p.slug, p.name, ...p.aliases].some(
          (n) => casefold(n) === casefold(name),
        ),
      )
      if (holder !== undefined)
        return yield* engineError(
          'person_exists',
          `já existe uma Pessoa chamada '${name}': ${holder.slug}`,
          'name_taken',
        )
    }
  })

/** Creates the Pessoa's file (`pessoas.criar`). */
export const createPerson = (
  input: NewPerson,
): Effect.Effect<Person, EngineError, Environment> =>
  Effect.gen(function* () {
    const slug = input.slug || personSlug(input.name)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
      return yield* engineError(
        'invalid_usage',
        `slug inválido: '${slug}' (só letras minúsculas sem acento, números e '-')`,
        'invalid_slug',
      )
    if (slug === 'dono' || casefold(pyStrip(input.name)) === 'dono')
      return yield* engineError(
        'invalid_usage',
        "'dono' é reservado para achar o Dono",
        'reserved_name',
      )
    const folder = yield* peopleFolder
    if (yield* Effect.sync(() => existsSync(join(folder, `${slug}.md`))))
      return yield* engineError(
        'person_exists',
        `já existe uma Pessoa com o slug '${slug}'`,
        'slug_taken',
      )
    yield* nameFree([slug, input.name, ...(input.aliases ?? [])])
    const email = yield* newOwnerEmail(input)
    const person: Person = {
      slug,
      name: pyStrip(input.name),
      aliases: [...new Set(input.aliases ?? [])],
      owner: input.owner ?? false,
      email,
      admin: false,
      vetoes: [],
      adjustments: [],
      openQuestions: [],
      imports: [],
      skippedSetup: [],
      body: '',
    }
    yield* savePerson(person)
    return person
  })

/** Writes the Pessoa's file (`pessoas.salvar`). */
export const savePerson = (
  person: Person,
): Effect.Effect<void, EngineError, Environment> =>
  Effect.flatMap(peopleFolder, (folder) =>
    writeMarkdown(
      join(folder, `${person.slug}.md`),
      encodePerson(person),
      person.body,
    ),
  )
