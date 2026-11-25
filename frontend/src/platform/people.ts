// Pessoas (map #72, W4): the list, a Pessoa's page with her taste, and every
// `pessoa` action the engine has (#87, #88). The pages read through
// `People`; a form posts to `/pessoas/<slug>/acao`, which runs the action as
// the logged-in Dono (the commit's author) and goes back to the page with
// what happened. Server only.

import {
  personAdjust,
  personCreate,
  personQuestions,
  personRemove,
  personReport,
  personSeen,
  personSkip,
  personState,
  personVeto,
  personView,
  readPeople,
  readTagGroups,
  type Author,
  type Engine,
  type ErrorOutput,
  type Outcome,
  type PersonView,
} from '@filmes/engine'
import {
  parseAction,
  type PersonAction,
  type PersonNotice,
  type PersonRefusal,
} from '#/content/person-action'
import {
  parseNewPerson,
  typedPerson,
  type NewPersonForm,
  type PersonCreateRefusal,
  type TypedPerson,
} from '#/content/person-create'
import type { CatalogScope } from '#/content/catalog-search'
import { currentOwner } from './auth'
import { catalogSearch } from './catalog-search'
import { appEngine } from './engine'
import { formPoster, seeOther } from './form-post'
import type { Owner } from './owners'
import { serverEnv } from './server-env'

/** A Pessoa in the list. */
export type PersonEntry = {
  person: string
  name: string
  aliases: string[]
  owner: boolean
}

/** A tag group a Veto or an open question can name. */
export type TagGroupChoice = { key: string; label: string }

/** What a Pessoa's page shows: `pessoa ver`, the tag groups for the Veto
 * form, and which Declarados and Relatos live in her file (the others came
 * from an import or a Feedback, and leave by their own way). */
export type PersonPage = Omit<PersonView, 'imports' | 'warning'> & {
  tagGroups: TagGroupChoice[]
}

/** What the screens and the actions need from the engine. */
export interface People {
  list(): Promise<Outcome<PersonEntry[]>>
  view(person: string): Promise<Outcome<PersonView>>
  tagGroups(): Promise<Outcome<TagGroupChoice[]>>
  /** Runs the action on the Pessoa, as `author`; says what happened. */
  act(
    person: string,
    action: PersonAction,
    author: Author,
  ): Promise<Outcome<PersonNotice>>
  /** Creates a Pessoa, as `author`; gives her slug. */
  create(input: NewPersonForm, author: Author): Promise<Outcome<string>>
}

const ok = <A>(output: A): Outcome<A> => ({ exitCode: 0, output })

/** The outcome's value through `f`; an error goes on as it is. */
const map = async <A, B>(
  outcome: Promise<Outcome<A>>,
  f: (a: A) => B,
): Promise<Outcome<B>> => {
  const done = await outcome
  return done.exitCode === 0 ? ok(f(done.output)) : done
}

/** The next request, after this one succeeded. */
const chain = async <A, B>(
  outcome: Promise<Outcome<A>>,
  next: (a: A) => Promise<Outcome<B>>,
): Promise<Outcome<B>> => {
  const done = await outcome
  return done.exitCode === 0 ? next(done.output) : done
}

const newOrSame = (added: boolean): PersonNotice =>
  added ? 'gravado' : 'igual'

export function peopleFromEngine(engine: Engine): People {
  const run = engine.run
  return {
    list: () =>
      map(run(readPeople), (people) =>
        people.map(({ slug, name, aliases, owner }) => ({
          person: slug,
          name,
          aliases: [...aliases],
          owner,
        })),
      ),
    view: (person) => run(personView(person)),
    create: (input, author) =>
      map(run(personCreate({ ...input, author })), (made) => made.person),
    tagGroups: () =>
      map(run(readTagGroups), (groups) =>
        [...groups].map(([key, { label }]) => ({ key, label })),
      ),
    act(person, action, author) {
      const by = { person, author }
      switch (action.kind) {
        case 'state':
          return map(run(personState({ ...by, ...statement(action) })), (r) =>
            newOrSame(r.new),
          )
        case 'report':
          return map(run(personReport({ ...by, ...statement(action) })), (r) =>
            newOrSame(r.new),
          )
        case 'seen':
          return map(
            run(
              personSeen({
                ...by,
                film: action.film,
                rating: action.rating,
                source: action.source,
              }),
            ),
            (r) => newOrSame(r.new),
          )
        case 'veto':
          return map(
            run(
              personVeto({
                ...by,
                text: action.text,
                target: action.target,
                group: action.group,
              }),
            ),
            (r) => newOrSame(r.new),
          )
        case 'adjust':
          return map(
            run(
              personAdjust({ ...by, link: action.link, level: action.level }),
            ),
            (r): PersonNotice => (r.new ? 'ajustado' : 'igual'),
          )
        case 'skip':
          return map(
            run(
              personSkip({
                ...by,
                text: action.text,
                subject: action.subject,
                group: action.subject !== undefined && isGroup(action.subject),
              }),
            ),
            (r): PersonNotice => (r.dropped ? 'saiu' : 'pulada'),
          )
        case 'answer':
          return answer(run, by, action)
        case 'remove':
          return map(
            run(personRemove({ ...by, kind: action.what, id: action.id })),
            (): PersonNotice => 'removido',
          )
      }
    },
  }
}

/** A subject that is not a Catalog entity (Q...) is a tag group's key. */
const isGroup = (subject: string) => !subject.startsWith('Q')

const statement = (
  action: Extract<PersonAction, { kind: 'state' | 'report' }>,
) => ({
  text: action.text,
  target: action.target,
  reaction: action.reaction,
  source: action.source,
})

/** An answer to an open question becomes a Declarado (about her subject,
 * when it is a Catalog entity), and the question leaves her file. Two
 * writes: if the Declarado fails, the question stays. */
async function answer(
  run: Engine['run'],
  by: { person: string; author: Author },
  action: Extract<PersonAction, { kind: 'answer' }>,
): Promise<Outcome<PersonNotice>> {
  const open = await run(personQuestions(by.person))
  if (open.exitCode !== 0) return open
  const question = open.output.openQuestions.find(
    (q) => q.factId === action.question,
  )
  if (!question) return refusedItem
  const about =
    question.subject !== null && !isGroup(question.subject)
      ? question.subject
      : undefined
  return chain(
    run(
      personState({
        ...by,
        text: action.text,
        target: about,
        reaction: about === undefined ? undefined : action.reaction,
      }),
    ),
    () =>
      map(
        run(
          personRemove({ ...by, kind: 'open_question', id: question.factId }),
        ),
        (): PersonNotice => 'respondida',
      ),
  )
}

const refusedItem: Outcome<never> = {
  exitCode: 1,
  output: {
    error: {
      code: 'unknown_open_question',
      message: 'a pergunta já não está aberta',
    },
  },
}

/** An engine error the Dono cannot fix from the page goes to the server log
 * (`docker logs`), so whoever runs the server sees why. */
function logEngineError(outcome: { output: ErrorOutput }): void {
  const { code, message } = outcome.output.error
  console.error(`engine: ${code}: ${message}`)
}

/** What `/pessoas` lists; null when the engine cannot run here. */
export async function peopleList(
  people: People,
): Promise<PersonEntry[] | null> {
  const list = await people.list()
  if (list.exitCode !== 0) {
    logEngineError(list)
    return null
  }
  return list.output
}

/** What `/pessoas/<slug>` shows: her page, `'unknown'` when no Pessoa has
 * that slug, or null when the engine cannot run here. */
export async function personPage(
  person: string,
  people: People,
): Promise<PersonPage | 'unknown' | null> {
  const view = await people.view(person)
  if (view.exitCode !== 0) {
    if (view.output.error.code === 'unknown_person') return 'unknown'
    logEngineError(view)
    return null
  }
  const groups = await people.tagGroups()
  if (groups.exitCode !== 0) {
    logEngineError(groups)
    return null
  }
  const { imports: _imports, warning: _warning, ...page } = view.output
  return { ...page, tagGroups: groups.output }
}

/** Why an action was refused, from the engine's error. */
function refusalOf(outcome: { output: ErrorOutput }): PersonRefusal {
  const { code } = outcome.output.error
  if (code === 'unknown_target') return 'alvo'
  if (code === 'invalid_usage') return 'pedido'
  if (code.startsWith('unknown_') || code.startsWith('ambiguous_'))
    return 'item'
  logEngineError(outcome)
  return 'indisponivel'
}

const pageOf = (person: string) => `/pessoas/${encodeURIComponent(person)}`

/** `POST /pessoas/<slug>/acao`: runs the form's action as the logged-in
 * Dono, who signs the commit, and goes back to her page saying what
 * happened (`?feito=`) or why not (`?erro=`). Only a Dono, and only a form
 * of this site (the `Origin`, as the logout checks): the page gate does not
 * cover this route. */
export async function personAction(
  request: Request,
  person: string,
  owner: Owner | null,
  people: People,
  origin: string | undefined,
): Promise<Response> {
  const poster = formPoster(request, owner, origin)
  if (poster instanceof Response) return poster
  const action = parseAction(await request.formData())
  if (!action) return seeOther(`${pageOf(person)}?erro=pedido`)
  const outcome = await people.act(person, action, ownerAuthor(poster))
  if (outcome.exitCode !== 0) {
    if (outcome.output.error.code === 'unknown_person')
      return seeOther('/pessoas?erro=pessoa')
    return seeOther(`${pageOf(person)}?erro=${refusalOf(outcome)}`)
  }
  return seeOther(`${pageOf(person)}?feito=${outcome.output}`)
}

/** Why the engine refused a new Pessoa. Its `invalid_usage` covers the
 * slug, the reserved "dono" and the e-mail; its message says which
 * (`createPerson`), and the platform test runs each on the real engine. */
function createRefusalOf(outcome: {
  output: ErrorOutput
}): PersonCreateRefusal {
  const { code, message } = outcome.output.error
  if (code === 'person_exists') return 'existe'
  if (code === 'invalid_usage') {
    if (message.startsWith('slug inválido')) return 'nome'
    if (message.startsWith("'dono'")) return 'reservado'
    if (message.startsWith('o e-mail')) return 'email-usado'
    if (message.includes('e-mail')) return 'email'
  }
  logEngineError(outcome)
  return 'indisponivel'
}

/** Back to the list with the reason and what was typed. */
function refusedCreate(
  refusal: PersonCreateRefusal,
  typed: TypedPerson,
): Response {
  const params = new URLSearchParams({ erro: refusal })
  for (const [name, value] of Object.entries(typed))
    if (value !== undefined) params.set(name, value)
  return seeOther(`/pessoas?${params.toString()}`)
}

/** `POST /pessoas/nova/enviar`: creates the Pessoa of the form as the
 * logged-in Dono, who signs the commit, and opens her page
 * (`?feito=criada`); refused, back to `/pessoas` with why and what was
 * typed. The engine syncs her into the database in the same write, so she
 * is a Presente at once. */
export async function personCreateAction(
  request: Request,
  owner: Owner | null,
  people: People,
  origin: string | undefined,
): Promise<Response> {
  const poster = formPoster(request, owner, origin)
  if (poster instanceof Response) return poster
  const form = await request.formData()
  const typed = typedPerson(form)
  const input = parseNewPerson(form)
  if (typeof input === 'string') return refusedCreate(input, typed)
  const outcome = await people.create(input, ownerAuthor(poster))
  if (outcome.exitCode !== 0)
    return refusedCreate(createRefusalOf(outcome), typed)
  return seeOther(`${pageOf(outcome.output)}?feito=criada`)
}

/** The logged-in Dono as the commit's author: the engine's `authorOf` of her
 * file, which the login read with the engine's own reader (the email in
 * lower case). */
export const ownerAuthor = (owner: Owner): Author => ({
  name: owner.name,
  email: owner.email,
})

// --- the app's -----------------------------------------------------------------

const appPeople = () => peopleFromEngine(appEngine())

/** The list for the app. */
export const appPeopleList = () => peopleList(appPeople())

/** A Pessoa's page for the app. */
export const appPersonPage = (person: string) => personPage(person, appPeople())

/** The action route for the app: the logged-in Dono, the process's
 * engine. */
export const servePersonAction = (request: Request, person: string) =>
  personAction(
    request,
    person,
    currentOwner(request),
    appPeople(),
    serverEnv().APP_ORIGIN,
  )

/** The create route for the app. */
export const servePersonCreate = (request: Request) =>
  personCreateAction(
    request,
    currentOwner(request),
    appPeople(),
    serverEnv().APP_ORIGIN,
  )

/** The Catálogo search for the app's screens (`catalog-search.ts`): the
 * Pessoa page's first, and Nova Sessão's and Feedback's. */
export const appCatalogSearch = (query: string, scope: CatalogScope) =>
  catalogSearch(appEngine().run, query, scope)
