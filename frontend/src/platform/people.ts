// Pessoas (map #72, W4): the list, a Pessoa's page with her taste, and every
// `pessoa` action the engine has (#87, #88). The pages read through
// `People`; a form posts to `/pessoas/<slug>/acao`, which runs the action as
// the logged-in Dono (the commit's author) and goes back to the page with
// what happened. Server only.

import {
  grantAccess,
  peopleCounts,
  personAdjust,
  personDelete,
  personEdit,
  personSessions,
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
  resolvePerson,
  revokeAccess,
  setupGuide,
  skipSetupStep,
  tasteSummary,
  type Author,
  type Engine,
  type ErrorOutput,
  type ErrorReason,
  type Outcome,
  type PersonSessions,
  type PersonView,
  type SetupGuide,
  type SetupStep,
  type SkipSetupResult,
  type TasteSummary,
} from '@filmes/engine'
import {
  formProblem,
  isAccessAction,
  parseAction,
  problemParam,
  reportSource,
  spotOf,
  type Edit,
  type PersonAction,
  type PersonDone,
  type PersonNotice,
  type PersonRefusal,
} from '#/content/person-action'
import {
  parseNewPerson,
  queryOfTyped,
  typedPerson,
  type NewPersonForm,
  type PersonCreateRefusal,
  type TypedPerson,
} from '#/content/person-create'
import type { CatalogScope } from '#/content/catalog-search'
import { personPath } from '#/content/paths'
import { catalogSearch } from './catalog-search'
import { appEngine } from './engine'
import { appPoster, failureOf, formPoster, seeOther } from './form-post'
import type { Owner } from './owners'

export type { Owner }

/** A Pessoa in the list, with how much the filmes knows of her: her
 * Notas (null without a database) and her Vetos. */
export type PersonEntry = {
  person: string
  name: string
  aliases: string[]
  owner: boolean
  ratings: number | null
  vetoes: number
}

/** A tag group a Veto or an open question can name. */
export type TagGroupChoice = { key: string; label: string }

/** What a Pessoa's page shows: `pessoa ver`, the tag groups for the Veto
 * form, and who is looking (her own page has no Relatos: what a Dono says
 * of herself is a Declarado). */
export type PersonPage = Omit<PersonView, 'imports' | 'warning'> & {
  tagGroups: TagGroupChoice[]
  /** The logged-in Dono, as a page may show her: no email. */
  viewer: Pick<Owner, 'person' | 'name' | 'admin'>
  /** Only for an admin (#166): the e-mail she logs in with, or the one
   * her file holds while she is not a Dono; null for none. */
  access?: { email: string | null }
  /** The Sessões she was in, the latest three, and her Satisfação. */
  sessions: PersonSessions
  /** Whether an import holds her history: she cannot be taken out. */
  imported: boolean
  /** What her Notas say she likes (#273): her genres and directors; null
   * when the engine could not read them (the page does without). */
  likes: TasteSummary | null
}

/** What the screens and the actions need from the engine. */
export interface People {
  list(): Promise<Outcome<PersonEntry[]>>
  view(person: string): Promise<Outcome<PersonView>>
  sessions(person: string): Promise<Outcome<PersonSessions>>
  /** The genres and directors of the films she gave a high Nota. */
  taste(person: string): Promise<Outcome<TasteSummary>>
  tagGroups(): Promise<Outcome<TagGroupChoice[]>>
  /** The e-mail in her file, for the admin's Acesso section. */
  email(person: string): Promise<Outcome<string | null>>
  /** Runs the action on the Pessoa as the logged-in Dono, who signs the
   * commit; says what happened. */
  act(
    person: string,
    action: PersonAction,
    owner: Owner,
  ): Promise<Outcome<PersonDone>>
  /** Creates a Pessoa as the logged-in Dono, who signs the commit; gives
   * her slug. */
  create(input: NewPersonForm, owner: Owner): Promise<Outcome<string>>
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
  return {
    list: () =>
      chain(engine.run(readPeople), (people) =>
        map(engine.run(peopleCounts), (counts) =>
          people.map(({ slug, name, aliases, owner }, i) => ({
            person: slug,
            name,
            aliases: [...aliases],
            owner,
            ratings: counts[i]?.ratings ?? null,
            vetoes: counts[i]?.vetoes ?? 0,
          })),
        ),
      ),
    view: (person) => engine.run(personView(person, { predictionError: true })),
    sessions: (person) => engine.run(personSessions(person)),
    taste: (person) => engine.run(tasteSummary({ person })),

    email: (person) => map(engine.run(resolvePerson(person)), (p) => p.email),
    create: (input, owner) =>
      map(
        engine.run(personCreate({ ...input, author: ownerAuthor(owner) }), {
          owner: owner.person,
        }),
        (made) => made.person,
      ),
    tagGroups: () =>
      map(engine.run(readTagGroups), (groups) =>
        [...groups].map(([key, { label }]) => ({ key, label })),
      ),
    act(person, action, owner) {
      // As the Dono: the engine refuses a Relato only about her.
      const run: Engine['run'] = (effect) =>
        engine.run(effect, { owner: owner.person })
      const by = { person, author: ownerAuthor(owner) }
      return isFactWrite(action)
        ? writeFact(run, by, action, owner)
        : changeFile(run, by, action)
    },
  }
}

type By = { person: string; author: Author }

/** The actions that write a Fato about her, which say whether it is new. */
type FactWrite = Extract<
  PersonAction,
  { kind: 'state' | 'report' | 'seen' | 'veto' | 'adjust' }
>

const FACT_WRITES: ReadonlySet<PersonAction['kind']> = new Set<
  PersonAction['kind']
>(['state', 'report', 'seen', 'veto', 'adjust'])

const isFactWrite = (action: PersonAction): action is FactWrite =>
  FACT_WRITES.has(action.kind)

/** A Declarado, a Relato, a Já visto, a Veto or an Ajuste. */
function writeFact(
  run: Engine['run'],
  by: By,
  action: FactWrite,
  owner: Owner,
): Promise<Outcome<PersonNotice>> {
  const added = (r: { new: boolean }) => newOrSame(r.new)
  switch (action.kind) {
    case 'state':
      return map(run(personState({ ...by, ...statement(action) })), added)
    case 'report':
      return map(
        run(
          personReport({
            ...by,
            ...statement(action),
            source: action.source ?? reportSource(owner.name),
          }),
        ),
        added,
      )
    case 'seen': {
      const { film, rating, source } = action
      return map(run(personSeen({ ...by, film, rating, source })), added)
    }
    case 'veto': {
      const { text, target, group } = action
      return map(run(personVeto({ ...by, text, target, group })), added)
    }
    case 'adjust':
      return map(
        run(personAdjust({ ...by, link: action.link, level: action.level })),
        (r): PersonNotice => (r.new ? 'ajustado' : 'igual'),
      )
  }
}

/** What else changes her file: a question skipped or answered, an item
 * taken out, her access, the Pessoa herself. */
function changeFile(
  run: Engine['run'],
  by: By,
  action: Exclude<PersonAction, FactWrite>,
): Promise<Outcome<PersonDone>> {
  switch (action.kind) {
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
    case 'edit':
      return map(
        run(personEdit({ ...by, ...editInput(action) })),
        (r): PersonDone =>
          r.changed ? { notice: 'editado', item: r.edited.factId } : 'igual',
      )
    case 'grant':
    case 'revoke':
      return access(run, by, action)
    case 'delete':
      return map(run(personDelete(by)), (): PersonNotice => 'removida')
  }
}

/** Gives or takes her access (#166); the route lets only an admin here. */
const access = (
  run: Engine['run'],
  by: { person: string; author: Author },
  action: Extract<PersonAction, { kind: 'grant' | 'revoke' }>,
): Promise<Outcome<PersonNotice>> =>
  action.kind === 'grant'
    ? map(
        run(grantAccess({ ...by, email: action.email })),
        (): PersonNotice => 'acesso-dado',
      )
    : map(run(revokeAccess(by)), (r) => (r.new ? 'acesso-tirado' : 'igual'))

/** The engine's edit from the form's: every field it sends. */
const editInput = (action: Edit) => {
  switch (action.what) {
    case 'seen':
      return {
        kind: action.what,
        id: action.id,
        rating: action.rating,
        ...(action.source !== undefined && { source: action.source }),
      }
    case 'veto':
      return {
        kind: action.what,
        id: action.id,
        text: action.text,
        target: action.target,
      }
    case 'stated':
    case 'report':
      return {
        kind: action.what,
        id: action.id,
        text: action.text,
        target: action.target,
        reaction: action.reaction,
        ...(action.source !== undefined && { source: action.source }),
      }
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

/** What `/pessoas/<slug>` shows to the logged-in Dono: her page,
 * `'unknown'` when no Pessoa has that slug, or null when the engine cannot
 * run here. */
export async function personPage(
  person: string,
  people: People,
  owner: Owner,
): Promise<PersonPage | 'unknown' | null> {
  const view = await people.view(person)
  if (view.exitCode !== 0) {
    if (view.output.error.code === 'unknown_person') return 'unknown'
    logEngineError(view)
    return null
  }
  const [groups, sessions, taste] = await Promise.all([
    people.tagGroups(),
    people.sessions(person),
    people.taste(person),
  ])
  if (groups.exitCode !== 0) {
    logEngineError(groups)
    return null
  }
  if (sessions.exitCode !== 0) {
    logEngineError(sessions)
    return null
  }
  if (taste.exitCode !== 0) logEngineError(taste)
  const { imports, warning: _warning, ...page } = view.output
  const viewer = { person: owner.person, name: owner.name, admin: owner.admin }
  const read = {
    ...page,
    tagGroups: groups.output,
    viewer,
    sessions: sessions.output,
    imported: imports.length > 0,
    likes: taste.exitCode === 0 ? taste.output : null,
  }
  if (!owner.admin) return read
  const access = await accessOf(page.person, people)
  return access && { ...read, access }
}

/** Her e-mail, for an admin's Acesso section; null when the engine
 * cannot run here. */
async function accessOf(
  person: string,
  people: People,
): Promise<{ email: string | null } | null> {
  const email = await people.email(person)
  if (email.exitCode === 0) return { email: email.output }
  logEngineError(email)
  return null
}

/** The page's reason for each of the engine's that an action can meet:
 * giving or taking access (#166). */
const ACCESS_REFUSALS: Partial<Record<ErrorReason, PersonRefusal>> = {
  email_required: 'email',
  invalid_email: 'email',
  email_taken: 'email-usado',
  already_owner: 'ja-dono',
  own_access: 'proprio-acesso',
  is_owner: 'e-dono',
  has_imports: 'tem-import',
  in_session: 'em-sessao',
  duplicate_item: 'repetido',
}

/** Why an action was refused, from the engine's error. */
function refusalOf(outcome: { output: ErrorOutput }): PersonRefusal {
  const { code, reason } = outcome.output.error
  const access = reason === undefined ? undefined : ACCESS_REFUSALS[reason]
  if (access !== undefined) return access
  if (code === 'unknown_target') return 'alvo'
  if (code === 'invalid_usage') return 'pedido'
  if (code.startsWith('unknown_') || code.startsWith('ambiguous_'))
    return 'item'
  logEngineError(outcome)
  return failureOf(outcome)
}

/** `POST /pessoas/<slug>/acao`: runs the form's action as the logged-in
 * Dono, who signs the commit, and goes back to her page saying what
 * happened (`?feito=`) or why not (`?erro=`). Only a Dono, and only a form
 * of this site (the `Origin`, as the logout checks): the page gate does not
 * cover this route. Giving or taking access is for an admin only. */
export async function personAction(
  request: Request,
  person: string,
  owner: Owner | null,
  people: People,
  origin: string | undefined,
): Promise<Response> {
  const poster = formPoster(request, owner, origin)
  if (poster instanceof Response) return poster
  const form = await request.formData()
  const back = backTo(personPath(person, person === poster.person), form)
  const action = parseAction(form)
  if (!action) {
    const problem = formProblem(form)
    return seeOther(
      back({
        erro: 'pedido',
        ...(problem && { campo: problemParam(problem) }),
      }),
    )
  }
  if (isAccessAction(action) && !poster.admin)
    return new Response('Só um admin dá ou tira acesso', { status: 403 })
  const outcome = await people.act(person, action, poster)
  if (outcome.exitCode !== 0) {
    if (outcome.output.error.code === 'unknown_person')
      return seeOther('/pessoas?erro=pessoa')
    return seeOther(back({ erro: refusalOf(outcome) }))
  }
  const done = outcome.output
  if (done === 'removida') return seeOther('/pessoas?feito=removida')
  return seeOther(
    typeof done === 'string'
      ? back({ feito: done })
      : back({ feito: done.notice, item: done.item }),
  )
}

/** Her page's address after a form (#273): the query says what happened
 * and in which ficha (`em`), and the fragment brings the page back to that
 * ficha, where the form was. */
const backTo =
  (path: string, form: FormData) =>
  (query: Record<string, string>): string => {
    const spot = spotOf(form)
    const params = new URLSearchParams({
      ...query,
      ...(spot !== undefined && { em: spot }),
    })
    return `${path}?${params.toString()}${spot === undefined ? '' : `#${spot}`}`
  }

/** The create form's reason for each of the engine's (`createPerson`). */
const CREATE_REFUSALS: Record<ErrorReason, PersonCreateRefusal> = {
  slug_taken: 'existe',
  name_taken: 'nome-usado',
  invalid_slug: 'nome',
  reserved_name: 'reservado',
  email_required: 'email',
  invalid_email: 'email',
  email_not_owner: 'email',
  email_taken: 'email-usado',
  // Not met on create: giving or taking access.
  already_owner: 'indisponivel',
  own_access: 'indisponivel',
  // Not met on create: reading a Pessoa's Trakt (#269).
  trakt_user_missing: 'indisponivel',
  trakt_private: 'indisponivel',
  trakt_not_linked: 'indisponivel',
  trakt_off: 'indisponivel',
  // Not met on create: taking a Pessoa out.
  is_owner: 'indisponivel',
  has_imports: 'indisponivel',
  in_session: 'indisponivel',
  // Not met on create: an edit equal to another item (#330).
  duplicate_item: 'indisponivel',
  // Not met on create: changing a Session (map #369).
  not_attending: 'indisponivel',
}

/** Why the engine refused a new Pessoa, by its reason; without one, it
 * failed, and the log says how. */
function createRefusalOf(outcome: {
  output: ErrorOutput
}): PersonCreateRefusal {
  const { reason } = outcome.output.error
  if (reason !== undefined) return CREATE_REFUSALS[reason]
  logEngineError(outcome)
  return failureOf(outcome)
}

/** Back to the list with the reason and what was typed. */
function refusedCreate(
  refusal: PersonCreateRefusal,
  typed: TypedPerson,
): Response {
  const params = new URLSearchParams({ erro: refusal })
  for (const [name, value] of Object.entries(queryOfTyped(typed)))
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
  const outcome = await people.create(input, poster)
  if (outcome.exitCode !== 0)
    return refusedCreate(createRefusalOf(outcome), typed)
  return seeOther(`${personPath(outcome.output, false)}?feito=criada`)
}

/** The logged-in Dono as the commit's author: the engine's `authorOf` of her
 * file, which the login read with the engine's own reader (the email in
 * lower case). */
export const ownerAuthor = (owner: Owner): Author => ({
  name: owner.name,
  email: owner.email,
})

// --- the home's setup guide (#143) ------------------------------------------

/** What the home's setup guide needs from the engine: where the Dono stands,
 * and keeping a step she skips in her file. */
export interface SetupGuideSource {
  guide(owner: Owner): Promise<Outcome<SetupGuide>>
  /** Keeps the step skipped in her file, in a commit she signs. */
  skip(owner: Owner, step: SetupStep): Promise<Outcome<SkipSetupResult>>
}

/** The guide over the engine; `connected` says whether the Claude app
 * connected with an email, which only `auth.sqlite` knows. */
export function setupGuideFromEngine(
  engine: Engine,
  connected: (email: string) => boolean,
): SetupGuideSource {
  return {
    guide: (owner) =>
      engine.run(
        setupGuide({ person: owner.person, connected: connected(owner.email) }),
        { owner: owner.person },
      ),
    skip: (owner, step) =>
      engine.run(
        skipSetupStep({
          person: owner.person,
          step,
          author: ownerAuthor(owner),
        }),
        { owner: owner.person },
      ),
  }
}

/** The guide for the app. */
export const appSetupGuide = (connected: (email: string) => boolean) =>
  setupGuideFromEngine(appEngine(), connected)

// --- the app's -----------------------------------------------------------------

const appPeople = () => peopleFromEngine(appEngine())

/** The list for the app. */
export const appPeopleList = () => peopleList(appPeople())

/** A Pessoa's page for the app, as the logged-in Dono sees it. */
export const appPersonPage = (person: string, owner: Owner) =>
  personPage(person, appPeople(), owner)

/** The action route for the app: the logged-in Dono, the process's
 * engine. */
export const servePersonAction = (request: Request, person: string) => {
  const { owner, origin } = appPoster(request)
  return personAction(request, person, owner, appPeople(), origin)
}

/** The create route for the app. */
export const servePersonCreate = (request: Request) => {
  const { owner, origin } = appPoster(request)
  return personCreateAction(request, owner, appPeople(), origin)
}

/** The Catálogo search for the app's screens (`catalog-search.ts`): the
 * Pessoa page's first, and Nova Sessão's and Feedback's. */
export const appCatalogSearch = (query: string, scope: CatalogScope) =>
  catalogSearch(appEngine().run, query, scope)
