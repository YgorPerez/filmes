import { useHydrated } from '@tanstack/react-router'
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  sectionOfSpot,
  type FieldProblem,
  type PersonNotice,
  type PersonRefusal,
} from '#/content/person-action'
import {
  imdbCsvPath,
  letterboxdCsvPath,
  importsPath,
  QUEUE_PATH,
  RATINGS_PATH,
} from '#/content/paths'
import { sessionPath } from '#/content/session-paths'
import { TRAKT_PATH } from '#/content/trakt-form'
import type { PersonPage } from '#/platform/people'
import type { TasteSummary } from '@filmes/engine'
import { Icon } from './kit/icon'
import { OwnerTag } from './kit/owner-tag'
import { Slip } from './kit/slip'
import {
  ActionForm,
  ActionForms,
  Alert,
  Disclosure,
  Item,
  Items,
  Meta,
  Notice,
  RatingField,
  RemoveForm,
  SelectField,
  Submit,
  TargetField,
  TextField,
  useRefusedInPlace,
  type Target,
} from './person-parts'
import { MyStartSections, type MyStart } from './my-start'
import { StrengthDots } from './person-marks'
import { PERSON } from './person.copy'
import { buttonVariants } from './kit/button-variants'
import { shortDate, weekdayDate } from './dates'

type Statement = PersonPage['stated'][number]
type Reaction = keyof typeof PERSON.reactions

const REACTION_OPTIONS = [
  { value: '', label: PERSON.noReaction },
  ...Object.entries(PERSON.reactions).map(([value, label]) => ({
    value,
    label,
  })),
]

/** What the last form did and where (#273): the ficha that posted says it
 * inside, where the Dono's eyes are, not under the h1. */
type Posted = {
  spot?: string
  notice?: PersonNotice
  refusal?: PersonRefusal
  problem?: FieldProblem
  name: string
  own: boolean
}

const PostedAt = createContext<Posted>({ name: '', own: false })

/** The field the server refused in the form of ficha `id`, when it came
 * back refused there. */
function useRefusedField(id: string): FieldProblem | null {
  const { spot, refusal, problem } = useContext(PostedAt)
  return spot !== undefined &&
    sectionOfSpot(spot) === id &&
    refusal === 'pedido' &&
    problem
    ? problem
    : null
}

/** What a save or a Tirar did, by the ficha that posted it: "Veto
 * gravado.". */
const noticeIn = (
  spot: string | undefined,
  notice: PersonNotice,
): string | undefined => {
  if (spot === undefined) return undefined
  const words: Partial<Record<string, Partial<Record<PersonNotice, string>>>> =
    PERSON.savedIn
  return words[sectionOfSpot(spot)]?.[notice]
}

/** The hint of a form's Fonte: on her own page, what she says counts as
 * said by her (#274). */
function useSourceHint(fallback: string) {
  const { own } = useContext(PostedAt)
  return own ? PERSON.ownSourceHint : PERSON.sourceHint(fallback)
}

/** The words of a notice or a refusal, for her. */
function useAnswerText() {
  const { name, spot, problem } = useContext(PostedAt)
  return {
    notice: (notice: PersonNotice) =>
      noticeIn(spot, notice) ?? PERSON.notices(name)[notice],
    refusal: (refusal: PersonRefusal) =>
      refusal === 'pedido' && problem
        ? PERSON.fieldProblem(problem)
        : PERSON.refusals(name)[refusal],
  }
}

/** What the last form did, inside the ficha `id` that posted it. An
 * Ajuste says it beside its own row instead. */
function SpotStatus({ id }: { id: string }) {
  const { spot, notice, refusal } = useContext(PostedAt)
  const stale = useRefusedInPlace()
  const text = useAnswerText()
  const { saved } = useContext(Editing)
  if (stale || spot === undefined || sectionOfSpot(spot) !== id) return null
  if (spot.startsWith('ajuste-') && !refusal) return null
  // An edit says it beside its item (#330).
  if (notice === 'editado' && saved !== undefined && !refusal) return null
  if (refusal) return <Alert>{text.refusal(refusal)}</Alert>
  return notice ? <Notice>{text.notice(notice)}</Notice> : null
}

/** Her Trakt connection, as Meu gosto's Notas say it (#274). */
type TraktState = 'connected' | 'disconnected' | null

type PersonScreenProps = {
  slug: string
  page: PersonPage | 'unknown' | null
  notice?: PersonNotice
  refusal?: PersonRefusal
  spot?: string
  problem?: FieldProblem
  /** Meu gosto's part of the setup guide; only on her own page. */
  start?: MyStart
  /** On Meu gosto, her Trakt connection; null when the server has no
   * Trakt. */
  trakt?: TraktState
  /** On Meu gosto, the films of her imports that wait in the queue. */
  pending?: number
  /** On Meu gosto, her genres and directors. */
  taste?: TasteSummary | null
  /** Before the JavaScript, the item open for editing (`?editar=`). */
  editing?: string
  /** The item an edit just saved (`?item=`), marked in its place. */
  saved?: string
}

/** `/pessoas/<slug>`, or Meu gosto for the Dono's own. Another Pessoa's
 * opens with how much the filmes knows of her and the one next step
 * (#273); then her Sessões and Notas on the left, and on the right what
 * the Dono acts on: the open questions, the Vetos, and "Afinar" folded
 * (Ajustes, Declarados, Relatos, Acesso). Meu gosto opens with its
 * glance and the setup guide's leftovers (`start`). Every form is a plain
 * POST that comes back to the ficha that posted it (`spot`, `#<spot>`),
 * which says what happened (`notice`, `refusal`, the refused field in
 * `problem`); with the JavaScript, it goes by `fetch` and reloads the
 * page in place (`ActionForm`). `page` is null when the engine cannot run
 * on this server. */
export function PersonScreen({
  slug,
  page,
  notice,
  refusal,
  spot,
  problem,
  start,
  trakt = null,
  pending = 0,
  taste = null,
  editing,
  saved,
}: PersonScreenProps) {
  if (page === 'unknown') return <UnknownPerson />
  const own = page !== null && page.person === page.viewer.person
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-2xl px-2xl py-3xl min-[900px]:max-w-[1040px]">
      {!own && (
        <a
          href="/pessoas"
          className={`${buttonVariants({ variant: 'option' })} self-start`}
        >
          {PERSON.back}
        </a>
      )}
      {page === null ? (
        <Alert>{PERSON.unavailable}</Alert>
      ) : (
        <PostedAt.Provider
          value={{ spot, notice, refusal, problem, name: page.name, own }}
        >
          <ActionForms name={page.name}>
            <EditingItem initial={editing} saved={saved}>
              <PersonHeader slug={slug} page={page} own={own} />
              <PersonColumns
                slug={slug}
                page={page}
                own={own}
                start={start}
                trakt={trakt}
                pending={pending}
                taste={taste}
              />
            </EditingItem>
          </ActionForms>
        </PostedAt.Provider>
      )}
    </main>
  )
}

/** From 900px, two columns in the order a phone reads them (#273): on
 * another Pessoa's page, what the Dono acts on at the left (the open
 * questions, the Vetos, the Já vistos) and her Sessões and Notas at the
 * right; on Meu gosto, the glance and the Notas first. Then, the whole
 * width, "Afinar" and, on another Pessoa's page, "Remover Pessoa": the
 * DOM, the focus and the screen go the same way at every width. */
function PersonColumns({
  slug,
  page,
  own,
  start,
  trakt,
  pending,
  taste,
}: {
  slug: string
  page: PersonPage
  own: boolean
  start?: MyStart
  trakt: TraktState
  pending: number
  taste: TasteSummary | null
}) {
  const { spot } = useContext(PostedAt)
  const posted = spot === undefined ? undefined : sectionOfSpot(spot)
  const column = 'flex min-w-0 flex-col gap-2xl'
  const notes = (
    <Notes
      slug={slug}
      own={own}
      page={page}
      pending={own ? pending : 0}
      trakt={own ? trakt : null}
    />
  )
  return (
    <>
      <div className="grid gap-2xl min-[900px]:grid-cols-2 min-[900px]:items-start">
        {own ? (
          <>
            <div className={column}>
              <Glance
                page={page}
                start={start}
                pending={pending}
                taste={taste}
              />
              {notes}
            </div>
            <div className={column}>
              <Contents page={page} />
              <Taste slug={slug} page={page} />
              {/* The connector and the skipped steps go right, so the two
                  columns end near each other on a desktop (#274). */}
              {start && <MyStartSections start={start} person={slug} />}
            </div>
          </>
        ) : (
          <>
            <div className={column}>
              <Taste slug={slug} page={page} />
            </div>
            <div className={column}>
              <SessionsWith page={page} />
              {notes}
            </div>
          </>
        )}
      </div>
      <Refine
        slug={slug}
        page={page}
        open={posted !== undefined && REFINE.has(posted)}
      />
      {!own && <RemovePerson slug={slug} page={page} />}
    </>
  )
}

/** Meu gosto's line of her Trakt connection, in the Notas (#274): whether
 * it is connected, and the way to the connection. */
function TraktStatus({ state }: { state: 'connected' | 'disconnected' }) {
  const { trakt } = PERSON.notes
  return (
    <p className="text-meta text-ink-2">
      {trakt.state(state === 'connected')} ·{' '}
      <a href={TRAKT_PATH} className="text-ink underline underline-offset-3">
        {trakt.link(state === 'connected')}
      </a>
    </p>
  )
}

/** No Pessoa has the address's slug (#273): the route's 404. */
export function UnknownPerson() {
  const { unknown } = PERSON
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-xl px-2xl py-3xl">
      <div className="flex flex-col gap-xs">
        <h1 className="font-display text-page-title">{unknown.title}</h1>
        <p className="max-w-[60ch] text-ink-2">{unknown.lead}</p>
      </div>
      <a
        href="/pessoas"
        className={buttonVariants({
          variant: 'option',
          className: 'self-start',
        })}
      >
        {unknown.back}
      </a>
    </main>
  )
}

/** Her name (on Meu gosto, the page's name, then the name the Sessões give
 * her) and aliases; on another Pessoa's, how much the filmes knows of her
 * and the next step. What the last form did shows here only when no ficha
 * posted it (a new Pessoa). */
function PersonHeader({
  slug,
  page,
  own,
}: {
  slug: string
  page: PersonPage
  own: boolean
}) {
  const { spot, notice, refusal } = useContext(PostedAt)
  const text = useAnswerText()
  // A form's refusal in place says what the last post did now.
  const stale = useRefusedInPlace()
  const here = spot === undefined && !stale
  return (
    <>
      <div className="flex flex-col gap-xs">
        {/* The sticker beside the h1, not in it: the heading is her name
            alone (#273). */}
        <div className="flex flex-wrap items-center gap-sm">
          <h1 className="font-display text-page-title">
            {own ? PERSON.myTaste : page.name}
          </h1>
          {!own && page.owner && <OwnerTag />}
        </div>
        {own ? (
          <Meta parts={[PERSON.ownName(page.name, page.aliases)]} />
        ) : (
          <Summary slug={slug} page={page} />
        )}
      </div>
      {here && refusal && (
        <Alert>
          {text.refusal(refusal)}
          {refusal === 'exportar' && <DownloadAgain slug={slug} />}
        </Alert>
      )}
      {here && notice && <Notice>{text.notice(notice)}</Notice>}
    </>
  )
}

/** After a CSV that did not come, the two downloads again, inside the
 * alert that says so (#276). */
function DownloadAgain({ slug }: { slug: string }) {
  const { notes } = PERSON
  const link = 'text-ink underline underline-offset-3'
  return (
    <span className="mt-xs block">
      {notes.retry}{' '}
      <a href={imdbCsvPath(slug)} className={link}>
        {notes.retryImdb}
      </a>
      {' · '}
      <a href={letterboxdCsvPath(slug)} className={link}>
        {notes.retryLetterboxd}
      </a>
    </span>
  )
}

/** Another Pessoa at a glance (#273): "também Quinzinho · 4 Notas · 1
 * Veto", or "falta conhecer"; what her Notas say she likes; and the one
 * next step, the page's orange button: her history when she has no Nota,
 * else the open questions, else a first Veto, else a film with her. */
function Summary({ slug, page }: { slug: string; page: PersonPage }) {
  const { summary } = PERSON
  const notes = page.ratings?.length ?? 0
  const counts = [
    notes > 0 ? summary.notes(notes) : null,
    page.vetoes.length > 0 ? summary.vetoes(page.vetoes.length) : null,
    page.openQuestions.length > 0
      ? summary.questions(page.openQuestions.length)
      : null,
    page.sessions.total > 0 ? summary.sessions(page.sessions.total) : null,
  ].filter((part) => part !== null)
  const next = nextStep(slug, page)
  const likes = likesOf(page)
  return (
    <>
      <Meta
        parts={[
          page.aliases.length > 0 ? PERSON.aliases(page.aliases) : null,
          ...(counts.length > 0 ? counts : [summary.unknown]),
        ]}
      />
      {likes && <p className="max-w-[60ch]">{likes}</p>}
      {next && <NextStep step={next[0]} href={next[1]} />}
    </>
  )
}

/** The page's one next step (#273): its label, and the orange button. */
function NextStep({ step, href }: { step: string; href: string }) {
  return (
    <div className="mt-sm flex flex-col items-start gap-xs">
      <span className="font-display text-label text-ink-2 uppercase">
        {PERSON.summary.next}
      </span>
      <a href={href} className={buttonVariants()}>
        {step}
      </a>
    </div>
  )
}

/** A Nota from 4 of 5 (8 of 10) on is a high one, as the engine's
 * `tasteSummary` reads it. */
const HIGH_NOTE = 4

/** What her Notas say she likes (#273): her genres and directors, or,
 * when the films she liked have none, the titles of her highest Notas;
 * null when no Nota is high. */
function likesOf(page: PersonPage): string | null {
  const { summary } = PERSON
  const { genres = [], directors = [] } = page.likes ?? {}
  if (genres.length + directors.length > 0)
    return summary.likes(page.name, genres, directors)
  const titles = (page.ratings ?? [])
    .filter((r) => r.rating >= HIGH_NOTE && r.title !== null)
    .toSorted((a, b) => b.rating - a.rating)
    .slice(0, 3)
    .map((r) => r.title ?? '')
  return titles.length > 0 ? summary.liked(page.name, titles) : null
}

/** Another Pessoa's next step and where it goes (#273), or none while
 * the open questions ask. A Veto is offered only while she has none: once
 * saved, the step moves on. */
function nextStep(slug: string, page: PersonPage): [string, string] | null {
  const { steps } = PERSON.summary
  if (page.ratings?.length === 0)
    return [steps.import(page.name), importsPath(slug, false)]
  // The open questions are the first ficha right below, with their own
  // answers: a button to them would be a second call for the same thing.
  if (page.openQuestions.length > 0) return null
  if (page.vetoes.length === 0)
    return [steps.veto(page.name), '#acrescentar-veto']
  const attendees = new URLSearchParams({
    presentes: [page.viewer.person, slug].join(','),
  })
  return [steps.ask(page.name), `/sessoes/nova?${attendees.toString()}`]
}

/** The Sessões she was in (#273): her Satisfação in words, and the latest
 * three, each a link to its page. Only once there is one. */
function SessionsWith({ page }: { page: PersonPage }) {
  const { sessions: copy } = PERSON
  const { total, recent, satisfaction } = page.sessions
  if (total === 0) return null
  return (
    <Slip
      id="sessoes"
      title={copy.title(page.name)}
      aside={String(total)}
      lead={
        satisfaction === null
          ? copy.noReaction(page.name)
          : copy.satisfaction(
              page.name,
              satisfaction.value,
              satisfaction.sessions,
            )
      }
    >
      <ul className="flex flex-col">
        {recent.map((s) => (
          <li key={s.id} className="border-rule not-first:border-t">
            <a
              href={sessionPath(s.id)}
              className="flex min-h-touch flex-col justify-center gap-0.5 py-sm text-ink no-underline hover:underline"
            >
              <span className="font-semibold">
                {s.chosen?.title ?? copy.nothingChosen}
              </span>
              <Meta
                parts={[
                  weekdayDate(s.date),
                  s.chosen ? copy.reaction(s.reaction) : null,
                ]}
              />
            </a>
          </li>
        ))}
      </ul>
    </Slip>
  )
}

/** Her Notas and where they come and go: Dar notas (only on Meu gosto: the
 * queue writes for the Dono logged in), her import, and, folded, the CSVs
 * once she has a Nota. The list itself opens on demand: it can be long. */
function Notes({
  slug,
  own,
  page,
  pending,
  trakt,
}: {
  slug: string
  own: boolean
  page: PersonPage
  pending: number
  trakt: TraktState
}) {
  const { notes } = PERSON
  const { ratings, predictionError } = page
  const option = buttonVariants({ variant: 'option' })
  return (
    <Slip
      id="notas"
      title={notes.title}
      aside={ratings === null ? undefined : String(ratings.length)}
    >
      {ratings === null && <p className="text-ink-2">{notes.noDatabase}</p>}
      {pending > 0 && <Pending pending={pending} />}
      {ratings?.length === 0 && (
        <p className="text-ink-2">{notes.empty(own, page.name)}</p>
      )}
      {predictionError && (
        <p className="text-meta text-ink-2">
          {notes.predictionError(
            predictionError.meanAbsoluteError,
            predictionError.films,
          )}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-xs">
        {own && (
          // An option: the glance's next step is the page's orange button.
          <a href={RATINGS_PATH} className={option}>
            {notes.rate}
          </a>
        )}
        <a href={importsPath(slug, own)} className={option}>
          {notes.import}
        </a>
      </div>
      {trakt && <TraktStatus state={trakt} />}
      {ratings !== null && ratings.length > 0 && (
        <>
          <NotesList slug={slug} own={own} page={page} ratings={ratings} />
          <NotesMore slug={slug} own={own} page={page} count={ratings.length} />
        </>
      )}
    </Slip>
  )
}

/** The films of her imports that wait in the queue, with the way there. */
function Pending({ pending }: { pending: number }) {
  const { notes } = PERSON
  return (
    <p className="flex flex-wrap items-center gap-x-sm">
      <span className="rounded-pill bg-sticker-orange px-sm font-display text-meta-strong text-on-sticker">
        {notes.pending(pending)}
      </span>
      <a href={QUEUE_PATH} className="text-ink underline underline-offset-3">
        {notes.resolve}
      </a>
    </p>
  )
}

/** Her Notas, folded: the list can be long. On Meu gosto each one can be
 * changed on Dar notas (a newer Nota is the one in force); one her file
 * holds (Dar notas, a Já visto with a Nota) can be taken out, and the one
 * it covered, if any, counts again. An imported one leaves with its
 * import (#274). */
function NotesList({
  slug,
  own,
  page,
  ratings,
}: {
  slug: string
  own: boolean
  page: PersonPage
  ratings: NonNullable<PersonPage['ratings']>
}) {
  const { notes } = PERSON
  const inFile = new Set(page.seen.map((s) => s.factId))
  return (
    <Disclosure summary={notes.list(ratings.length)}>
      <ul className="flex flex-col">
        {ratings.map((r) => {
          const title = r.title ?? r.filmId
          return (
            <Item
              key={r.factId}
              actions={
                <span className="flex shrink-0 items-center gap-xs">
                  {own && (
                    <a
                      href={`${RATINGS_PATH}?filme=${encodeURIComponent(r.filmId)}`}
                      aria-label={notes.changeLabel(title)}
                      className={buttonVariants({ variant: 'option' })}
                    >
                      {notes.change}
                    </a>
                  )}
                  {inFile.has(r.factId) && (
                    <RemoveForm
                      slug={slug}
                      what="seen"
                      id={r.factId}
                      label={notes.removeWhat(title)}
                    />
                  )}
                </span>
              }
            >
              <span>{title}</span>
              <Meta
                parts={[
                  PERSON.ratingText(r.rating),
                  shortDate(r.date),
                  PERSON.ratingSource(r.rating, r.source, page.name),
                ]}
              />
            </Item>
          )
        })}
      </ul>
    </Disclosure>
  )
}

/** The CSVs of her Notas, as two links, and for an admin the MovieLens
 * word (#274). */
function NotesMore({
  slug,
  own,
  page,
  count,
}: {
  slug: string
  own: boolean
  page: PersonPage
  count: number
}) {
  const { notes } = PERSON
  const link =
    'inline-flex min-h-touch items-center text-ink underline underline-offset-3'
  return (
    <div className="flex flex-col gap-2xs">
      <p className="flex flex-wrap items-center gap-x-sm text-meta text-ink-2">
        {notes.more}
        <a href={imdbCsvPath(slug)} className={link}>
          {notes.download}
        </a>
        <span aria-hidden="true">·</span>
        <a href={letterboxdCsvPath(slug)} className={link}>
          {notes.downloadLetterboxd}
        </a>
      </p>
      {page.viewer.admin && (
        <p className="text-meta text-ink-2">
          {notes.movielens(own, count, page.name)}
        </p>
      )}
    </div>
  )
}

/** A Nota of the rating screen is a Já visto too; the Notas list shows it,
 * so Já vistos leaves it out. The engine's `RATING_SCREEN_SOURCE`. */
const SITE_RATINGS = 'notas no site'

/** The Já vistos her page lists: what she said she saw, not her Notas. */
const seenOf = (page: PersonPage) =>
  page.seen.filter((s) => s.source !== SITE_RATINGS)

/** Relatos have a ficha where a form can add one or one was told: not on
 * the Dono's own page until another Dono tells something. */
const hasReports = (page: PersonPage) =>
  page.person !== page.viewer.person || page.reports.length > 0

/** The fichas of her taste with how many each holds: what Meu gosto's
 * glance and contents count. */
function tasteParts(page: PersonPage) {
  return [
    ['perguntas', PERSON.questions.title, page.openQuestions.length],
    ['vetos', PERSON.vetoes.title, page.vetoes.length],
    ['declarados', PERSON.stated.title, page.stated.length],
    ...(hasReports(page)
      ? [['relatos', PERSON.reports.title, page.reports.length] as const]
      : []),
    ['vistos', PERSON.seen.title, seenOf(page).length],
  ] as const
}

/** How many elos she moved off normal (the engine lists only those). */
const changedAdjustments = (page: PersonPage) => page.adjustments.length

/** Meu gosto's opening ficha: how many Notas (and how many to 10), what
 * she said of her taste, and the one next step. */
function Glance({
  page,
  start,
  pending,
  taste,
}: {
  page: PersonPage
  start?: MyStart
  pending: number
  taste: TasteSummary | null
}) {
  const { glance } = PERSON
  const notes = page.ratings?.length ?? 0
  const said = tasteParts(page)
    .filter(([id, , n]) => n > 0 && id !== 'perguntas')
    .map(([, title, n]) => `${n} ${title}`)
  const connector = start?.setup?.steps.find((s) => s.step === 'connector')
  const [step, href] =
    pending > 0
      ? [glance.steps.queue(pending), QUEUE_PATH]
      : notes < 10
        ? [glance.steps.rate, RATINGS_PATH]
        : connector && !connector.done && !connector.skipped
          ? [glance.steps.connector, '#conector']
          : page.openQuestions.length > 0
            ? [glance.steps.questions, '#perguntas']
            : [glance.steps.ask, '/sessoes/nova']
  return (
    <Slip id="olhada" title={glance.title}>
      <p className="font-display text-step-title">
        {glance.notes(notes)}
        {notes > 0 && notes < 10 && (
          <span className="font-body text-meta font-normal text-ink-2">
            {' · '}
            {glance.toTen(notes)}
          </span>
        )}
      </p>
      {taste && taste.genres.length + taste.directors.length > 0 && (
        <p>{glance.likes(taste.genres, taste.directors)}</p>
      )}
      <p className="text-ink-2">
        {said.length === 0
          ? glance.nothingSaid
          : `${glance.said}: ${said.join(' · ')}`}
      </p>
      <NextStep step={step} href={href} />
    </Slip>
  )
}

/** Meu gosto's fichas that hold something, as a row of links with how
 * many: the page is long, and the Dono comes for one of them. */
function Contents({ page }: { page: PersonPage }) {
  const entries: readonly (readonly [string, string, number])[] = [
    ...tasteParts(page).filter(([, , n]) => n > 0),
    ['ajustes', PERSON.adjustments.title, changedAdjustments(page)] as const,
  ].filter(([, , n]) => n !== 0)
  if (entries.length === 0) return null
  return (
    <nav aria-label={PERSON.contents}>
      <ul className="flex flex-wrap gap-xs">
        {entries.map(([id, title, n]) => (
          <li key={id}>
            <a
              href={`#${id}`}
              className="inline-flex min-h-touch items-center gap-xs rounded-pill border-(length:--border-width-stroke) border-rule bg-surface px-lg font-display text-control text-ink no-underline hover:bg-surface-2"
            >
              {title} <span className="text-ink-2 tabular-nums">{n}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** The fichas the Afinar fold holds. */
const REFINE = new Set(['ajustes', 'declarados', 'relatos', 'acesso'])

/** What the Dono acts on, in that order (#273): the open questions (only
 * when there is one), the Vetos (always: the strongest thing she can say),
 * the Já vistos without a Nota. */
function Taste({ slug, page }: { slug: string; page: PersonPage }) {
  const { spot } = useContext(PostedAt)
  const posted = spot === undefined ? undefined : sectionOfSpot(spot)
  return (
    <>
      {/* Only with a question, or right after the last one left: it
          says so there. */}
      {(page.openQuestions.length > 0 || posted === 'perguntas') && (
        <OpenQuestions slug={slug} page={page} />
      )}
      <Vetoes slug={slug} page={page} />
      {/* A plain slip even while empty, like the Vetos: its add fold is
          the one step to a Já visto (#273). */}
      <Seen slug={slug} page={page} />
    </>
  )
}

/** "Afinar", folded: the Ajustes, Declarados, Relatos and Acesso, each
 * with how many it holds on the fold's summary. */
function Refine({
  slug,
  page,
  open,
}: {
  slug: string
  page: PersonPage
  open: boolean
}) {
  const own = page.person === page.viewer.person
  const access = !own && page.viewer.admin && page.access !== undefined
  const reports = hasReports(page)
  const refine: readonly (readonly [string, number])[] = [
    [PERSON.adjustments.title, changedAdjustments(page)],
    [PERSON.stated.title, page.stated.length],
    ...(reports ? [[PERSON.reports.title, page.reports.length] as const] : []),
    ...(access ? [[PERSON.access.title, 0] as const] : []),
  ]
  return (
    <Disclosure
      id="afinar"
      summary={PERSON.refine(
        refine.map(([title, n]) => (n > 0 ? `${title} (${n})` : title)),
      )}
      open={open || undefined}
    >
      <div className="grid gap-2xl min-[900px]:grid-cols-2 min-[900px]:items-start">
        <Adjustments slug={slug} page={page} />
        <div className="flex min-w-0 flex-col gap-2xl">
          <Statements
            slug={slug}
            kind="stated"
            own={own}
            items={page.stated}
            source={PERSON.stated.source}
          />
          {reports && (
            <Statements
              slug={slug}
              kind="report"
              own={own}
              items={page.reports}
              source={own ? null : PERSON.reports.source(page.viewer.name)}
            />
          )}
          {access && <Access slug={slug} page={page} />}
        </div>
      </div>
    </Disclosure>
  )
}

type Part = { slug: string; page: PersonPage }

/** How many a ficha holds, on its stub. */
const countOf = (items: readonly unknown[]) => String(items.length)

/** Each open question: one tap says whether she likes what it asks about
 * ("Curte", "Não curte"), which becomes a Declarado; "Pular" leaves it for
 * later; a longer answer opens in words. */
function OpenQuestions({ slug, page }: Part) {
  const { questions } = PERSON
  return (
    <Slip
      id="perguntas"
      title={questions.title}
      aside={countOf(page.openQuestions)}
    >
      <SpotStatus id="perguntas" />
      <Items empty={questions.empty}>
        {page.openQuestions.map((q) => (
          <Question key={q.factId} slug={slug} name={page.name} q={q} />
        ))}
      </Items>
    </Slip>
  )
}

type OpenQuestion = PersonPage['openQuestions'][number]

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** One tap's answer to a question: "Curte" or "Não curte". */
function QuickAnswer({
  slug,
  q,
  reaction,
}: {
  slug: string
  q: OpenQuestion
  reaction: 'like' | 'dislike'
}) {
  const { questions } = PERSON
  const about = q.label ?? null
  const like = reaction === 'like'
  return (
    <ActionForm
      slug={slug}
      action="responder"
      className="flex"
      label={`${like ? questions.likes : questions.dislikes}: ${q.text}`}
    >
      <input type="hidden" name="pergunta" value={q.factId} />
      <input
        type="hidden"
        name="texto"
        value={
          like ? questions.likesText(about) : questions.dislikesText(about)
        }
      />
      {q.subject?.startsWith('Q') === true && (
        <input type="hidden" name="reacao" value={reaction} />
      )}
      <Submit className="">
        {like ? questions.likes : questions.dislikes}
      </Submit>
    </ActionForm>
  )
}

/** An open question: the quick answers, "Pular" and, folded, the answer
 * in words. */
function Question({
  slug,
  name,
  q,
}: {
  slug: string
  name: string
  q: OpenQuestion
}) {
  const { questions } = PERSON
  return (
    <Item>
      {/* The engine words it as a phrase ("o Quim curte…?"): here it
          starts the line. */}
      <span>{sentence(q.text)}</span>
      <Meta parts={[questions.skips(q.skips), shortDate(q.date)]} />
      <div className="mt-sm flex flex-col gap-sm">
        <div className="flex flex-wrap gap-xs">
          <QuickAnswer slug={slug} q={q} reaction="like" />
          <QuickAnswer slug={slug} q={q} reaction="dislike" />
          <ActionForm
            slug={slug}
            action="pular"
            className="flex"
            busy={questions.skipping}
          >
            <input type="hidden" name="texto" value={q.text} />
            {q.subject && (
              <input type="hidden" name="assunto" value={q.subject} />
            )}
            <Submit className="" aria-label={`${questions.skip}: ${q.text}`}>
              {questions.skip}
            </Submit>
          </ActionForm>
        </div>
        <LongAnswer slug={slug} name={name} q={q} />
      </div>
    </Item>
  )
}

/** The answer in words, folded, with the reaction when the question is
 * about an entity. */
function LongAnswer({
  slug,
  name,
  q,
}: {
  slug: string
  name: string
  q: OpenQuestion
}) {
  const { questions } = PERSON
  return (
    <Disclosure summary={questions.answer}>
      <ActionForm
        slug={slug}
        action="responder"
        label={`${questions.answer}: ${q.text}`}
      >
        <input type="hidden" name="pergunta" value={q.factId} />
        <TextField name="texto" label={questions.answerText(name)} required />
        {q.subject?.startsWith('Q') === true && (
          <SelectField
            name="reacao"
            label={PERSON.reaction}
            hint={q.label ?? q.subject ?? undefined}
            options={REACTION_OPTIONS}
          />
        )}
        <Submit>{PERSON.save}</Submit>
      </ActionForm>
    </Disclosure>
  )
}

function Vetoes({ slug, page }: Part) {
  const { vetoes } = PERSON
  const refused = useRefusedField('vetos')
  const editingIn = useEditingIn()
  return (
    <Slip id="vetos" title={vetoes.title} aside={countOf(page.vetoes)}>
      <SpotStatus id="vetos" />
      <Items empty={vetoes.empty}>
        {page.vetoes.map((v) => (
          <EditableItem
            key={v.factId}
            slug={slug}
            what="veto"
            id={v.factId}
            label={v.text}
            context={[PERSON.plainLabel(v.label), shortDate(v.date)]}
            form={<VetoFields v={v} groups={page.tagGroups} />}
          >
            <span>“{v.text}”</span>
            <Meta parts={[PERSON.plainLabel(v.label), ...dates(v)]} />
          </EditableItem>
        ))}
      </Items>
      {!editingIn(page.vetoes) && (
        <Disclosure
          id="acrescentar-veto"
          summary={vetoes.add}
          open={refused !== null || undefined}
        >
          <ActionForm
            slug={slug}
            action="vetar"
            label={vetoes.add}
            problem={refused}
          >
            <TextField
              name="texto"
              label={vetoes.text}
              placeholder={vetoes.placeholder}
              required
            />
            <TargetField
              name="alvo"
              label={PERSON.target}
              scope="all"
              groups={page.tagGroups}
            />
            <Submit>{PERSON.save}</Submit>
          </ActionForm>
        </Disclosure>
      )}
    </Slip>
  )
}

function Adjustments({ slug, page }: Part) {
  const { adjustments } = PERSON
  const own = page.person === page.viewer.person
  const levelOf = (link: string) =>
    page.adjustments.find((a) => a.link === link)
  const changed = changedAdjustments(page)
  return (
    <Slip
      id="ajustes"
      title={adjustments.title}
      aside={
        changed > 0 ? adjustments.changed(changed) : adjustments.noneChanged
      }
      lead={own ? adjustments.ownLead : adjustments.lead(page.name)}
    >
      <SpotStatus id="ajustes" />
      <p className="text-meta text-ink-2">{adjustments.levelsHint}</p>
      {(['people', 'film'] as const).map((group) => (
        <section
          key={group}
          aria-labelledby={`ajustes-${group}`}
          className="flex flex-col"
        >
          <h3
            id={`ajustes-${group}`}
            className="font-display text-label text-ink-2 uppercase"
          >
            {adjustments.groups[group]}
          </h3>
          <ul className="flex flex-col">
            {PERSON.linkGroups[group].map((link) => (
              <li
                key={link}
                id={`ajuste-${link}`}
                className="scroll-mt-2xl border-rule py-md not-first:border-t"
              >
                <AdjustmentForm
                  slug={slug}
                  link={link}
                  legend={adjustments.level(PERSON.links[link])}
                  current={levelOf(link)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Slip>
  )
}

/** One Ajuste: its four levels. With the JavaScript, a tap on a level
 * saves it, and "gravado" shows beside it; before, "Mudar" posts the
 * form. */
function AdjustmentForm({
  slug,
  link,
  legend,
  current,
}: {
  slug: string
  link: string
  legend: string
  current?: PersonPage['adjustments'][number]
}) {
  const hydrated = useHydrated()
  const { spot, notice } = useContext(PostedAt)
  const stale = useRefusedInPlace()
  const saved =
    !stale &&
    spot === `ajuste-${link}` &&
    (notice === 'ajustado' || notice === 'igual')
  return (
    <ActionForm
      slug={slug}
      action="ajustar"
      className="flex flex-wrap items-end gap-sm"
    >
      <input type="hidden" name="elo" value={link} />
      <LevelPicker
        legend={legend}
        saved={saved}
        level={current?.level ?? 'normal'}
        onPick={hydrated ? (form) => form?.requestSubmit() : undefined}
      />
      {!hydrated && <Submit className="">{PERSON.adjustments.change}</Submit>}
    </ActionForm>
  )
}

/** The four levels of an Ajuste side by side, one marked: radios, so the
 * form posts the marked one without JavaScript. 44px tall, the whole row
 * wide. */
function LevelPicker({
  legend,
  saved,
  level,
  onPick,
}: {
  legend: string
  saved: boolean
  level: string
  /** A level was tapped: the fieldset's form. */
  onPick?: (form: HTMLFormElement | null) => void
}) {
  return (
    <fieldset
      onChange={(event) => onPick?.(event.currentTarget.form)}
      className="flex min-w-0 flex-1 basis-[240px] flex-col gap-xs"
    >
      <legend className="mb-xs font-display text-field-label">
        {legend}
        {/* The tick stays on the label's line: no date beside it, which
            said nothing to the Dono there (#273). */}
        {saved && (
          <span className="ml-sm font-body font-normal whitespace-nowrap text-ink-2">
            <span aria-hidden="true">✓ </span>
            <span role="status">{PERSON.adjustments.saved}</span>
          </span>
        )}
      </legend>
      <div className="grid grid-cols-4 rounded-pill border-(length:--border-width-stroke) border-rule bg-surface p-0.75">
        {Object.entries(PERSON.levels).map(([value, label]) => (
          <label key={value} className="flex">
            <input
              type="radio"
              name="nivel"
              value={value}
              defaultChecked={value === level}
              className="peer sr-only"
            />
            <span className="flex min-h-touch flex-1 cursor-pointer items-center justify-center rounded-pill px-xs font-display text-control text-ink-2 select-none peer-checked:bg-surface-2 peer-checked:font-bold peer-checked:text-ink peer-checked:ring-2 peer-checked:ring-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus">
              {label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** Where a Declarado or Relato lives: her file, an import or a Feedback. */
function originOf(kind: 'stated' | 'report', s: Statement) {
  if (s.factId.startsWith(kind === 'stated' ? 'declarados:' : 'relatos:'))
    return 'file'
  return s.factId.startsWith('feedback:')
    ? PERSON.fromFeedback
    : PERSON.imported
}

/** What the Declarado is about, in words, its title the link to the film
 * or entity (the id stays behind it): "sobre O Farol de Areia", "ama
 * Lia Couto", "só menciona a tag “chuva”". */
function StatementTarget({ s }: { s: Statement }) {
  if (s.target === null) return null
  const reaction = s.reaction
    ? PERSON.reactions[s.reaction as Reaction]
    : PERSON.about
  return (
    <span className="text-meta text-ink-2">
      {reaction}{' '}
      <a
        href={PERSON.targetUrl(s.target)}
        target="_blank"
        rel="noreferrer"
        className="text-ink underline decoration-rule underline-offset-3 hover:decoration-ink"
      >
        {PERSON.plainLabel(s.label ?? s.target)}
      </a>
    </span>
  )
}

function Statements({
  slug,
  kind,
  own,
  items,
  source,
}: {
  slug: string
  kind: 'stated' | 'report'
  /** Meu gosto: the lead speaks to her. */
  own: boolean
  items: readonly Statement[]
  /** The source the engine writes when the form gives none; null for no
   * form. */
  source: string | null
}) {
  const { name } = useContext(PostedAt)
  const copy = kind === 'stated' ? PERSON.stated : PERSON.reports
  const id = kind === 'stated' ? 'declarados' : 'relatos'
  const refused = useRefusedField(id)
  const editingIn = useEditingIn()
  return (
    <Slip
      id={id}
      title={copy.title}
      aside={countOf(items)}
      lead={own ? copy.ownLead : copy.lead(name)}
    >
      <SpotStatus id={id} />
      <Items empty={copy.empty}>
        {items.map((s) => (
          <StatementItem key={s.factId} slug={slug} kind={kind} s={s} />
        ))}
      </Items>
      {source !== null && !editingIn(items) && (
        <AddStatement
          slug={slug}
          kind={kind}
          source={source}
          refused={refused}
        />
      )}
    </Slip>
  )
}

/** A Declarado or Relato: its text, Força, target and source; "Tirar"
 * when it came by a form, the file's word when it did not. */
function StatementItem({
  slug,
  kind,
  s,
}: {
  slug: string
  kind: 'stated' | 'report'
  s: Statement
}) {
  const origin = originOf(kind, s)
  const body = (
    <>
      <span>{PERSON.statementText(s.text)}</span>
      <span className="flex flex-wrap items-center gap-x-sm gap-y-2xs">
        <StrengthDots
          strength={s.strength}
          word={PERSON.strengths[s.strength]}
        />
        <StatementTarget s={s} />
        <Meta parts={[...dates(s), s.source]} />
      </span>
    </>
  )
  if (origin !== 'file')
    return (
      <Item
        actions={
          <span className="flex shrink-0 flex-col items-end gap-2xs text-right">
            <span className="font-display text-label text-ink-2 uppercase">
              {origin}
            </span>
            <span className="text-meta text-ink-2">{PERSON.edit.readOnly}</span>
          </span>
        }
      >
        {body}
      </Item>
    )
  return (
    <EditableItem
      slug={slug}
      what={kind}
      id={s.factId}
      label={s.text}
      context={[statementAbout(s), shortDate(s.date)]}
      form={<StatementFields s={s} />}
    >
      {body}
    </EditableItem>
  )
}

/** The form that adds a Declarado or a Relato, folded. */
function AddStatement({
  slug,
  kind,
  source,
  refused,
}: {
  slug: string
  kind: 'stated' | 'report'
  source: string
  refused: FieldProblem | null
}) {
  const copy = kind === 'stated' ? PERSON.stated : PERSON.reports
  const hint = useSourceHint(source)
  return (
    <Disclosure summary={copy.add} open={refused !== null || undefined}>
      <ActionForm
        slug={slug}
        action={kind === 'stated' ? 'declarar' : 'relatar'}
        label={copy.add}
        problem={refused}
      >
        <TextField name="texto" label={PERSON.text} required />
        <TargetField
          name="alvo"
          label={PERSON.statementTarget}
          hint={PERSON.targetHint}
          scope="all"
        />
        <SelectField
          name="reacao"
          label={PERSON.reaction}
          options={REACTION_OPTIONS}
        />
        <TextField name="fonte" label={PERSON.source} hint={hint} />
        <Submit>{PERSON.save}</Submit>
      </ActionForm>
    </Disclosure>
  )
}

function Seen({ slug, page }: Part) {
  const { seen } = PERSON
  const refused = useRefusedField('vistos')
  const editingIn = useEditingIn()
  const hint = useSourceHint(seen.source)
  return (
    <Slip id="vistos" title={seen.title} aside={countOf(seenOf(page))}>
      <SpotStatus id="vistos" />
      <Items empty={seen.empty}>
        {seenOf(page).map((s) => (
          <EditableItem
            key={s.factId}
            slug={slug}
            what="seen"
            id={s.factId}
            label={s.title}
            context={[s.title, shortDate(s.date)]}
            form={<SeenFields s={s} />}
          >
            <span>{s.title}</span>
            <Meta
              parts={[
                s.rating === null ? null : PERSON.ratingText(s.rating),
                ...dates(s),
                s.rating === null
                  ? s.source
                  : PERSON.ratingSource(s.rating, s.source),
              ]}
            />
          </EditableItem>
        ))}
      </Items>
      {!editingIn(seenOf(page)) && (
        <Disclosure summary={seen.add} open={refused !== null || undefined}>
          <ActionForm
            slug={slug}
            action="visto"
            label={seen.add}
            problem={refused}
          >
            <TargetField name="filme" label={PERSON.film} scope="films" />
            <RatingField name="nota" label={PERSON.rating} />
            <TextField name="fonte" label={PERSON.source} hint={hint} />
            <Submit>{PERSON.save}</Submit>
          </ActionForm>
        </Disclosure>
      )}
    </Slip>
  )
}

/** A step that asks first (#273): the button opens what it does and the
 * confirm, as an import's Tirar. */
function Confirm({
  open,
  warning,
  children,
}: {
  open: string
  warning: string
  children: ReactNode
}) {
  return (
    <details className="group">
      <summary
        className={buttonVariants({
          variant: 'option',
          className:
            'list-none group-open:border-2 group-open:border-ink group-open:bg-surface-2 [&::-webkit-details-marker]:hidden',
        })}
      >
        {open}
      </summary>
      <div className="mt-sm flex max-w-[360px] flex-col gap-sm rounded-field bg-surface-2 p-lg">
        <p className="text-meta">{warning}</p>
        {children}
      </div>
    </details>
  )
}

/** The Acesso section of a Pessoa's page (#166), for an admin only: give
 * her a Google e-mail and she is a Dono; take it away, after a confirm,
 * and her next request is refused. Not on Meu gosto: her own access never
 * leaves from here. */
function Access({ slug, page }: { slug: string; page: PersonPage }) {
  const { access } = page
  if (!page.viewer.admin || access === undefined) return null
  const copy = PERSON.access
  return (
    <Slip id="acesso" title={copy.title} lead={copy.lead(page.name)}>
      <SpotStatus id="acesso" />
      {page.owner ? (
        <>
          <p>{copy.owner(access.email)}</p>
          <Confirm open={copy.revoke} warning={copy.revokeWarning(page.name)}>
            <ActionForm
              slug={slug}
              action="tirar-acesso"
              label={copy.revoke}
              busy={copy.revoking}
            >
              <Submit>{copy.revokeConfirm(page.name)}</Submit>
            </ActionForm>
          </Confirm>
        </>
      ) : (
        <>
          <p>{copy.none}</p>
          <ActionForm slug={slug} action="dar-acesso" label={copy.grant}>
            <TextField
              type="email"
              name="email"
              label={copy.email}
              defaultValue={access.email ?? undefined}
              required
            />
            <p className="text-meta text-ink-2">{copy.testUsers}</p>
            <Submit>{copy.grant}</Submit>
          </ActionForm>
        </>
      )}
    </Slip>
  )
}

/** "Remover Pessoa" (#273), folded at the bottom of another Pessoa's
 * page: for one made by mistake, the fold says what goes and holds the
 * confirm. A Dono, a Pessoa in a Session or one with an import stays, and
 * the fold says why instead. */
function RemovePerson({ slug, page }: { slug: string; page: PersonPage }) {
  const copy = PERSON.removePerson
  const { spot } = useContext(PostedAt)
  const why = page.owner
    ? copy.owner(page.name)
    : page.sessions.total > 0
      ? copy.sessions(page.name, page.sessions.total)
      : page.imported
        ? copy.imported(page.name)
        : null
  return (
    <Disclosure
      id="remover-pessoa"
      summary={copy.title}
      open={spot === 'remover-pessoa' || undefined}
    >
      <div className="flex flex-col gap-md">
        <SpotStatus id="remover-pessoa" />
        {why === null ? (
          <>
            <p className="text-meta text-ink-2">
              {copy.lead(page.name)} {copy.warning(page.name)}
            </p>
            <ActionForm
              slug={slug}
              action="remover-pessoa"
              label={copy.open(page.name)}
              busy={copy.busy}
            >
              <Submit>{copy.confirm(page.name)}</Submit>
            </ActionForm>
          </>
        ) : (
          <p className="text-meta text-ink-2">{why}</p>
        )}
      </div>
    </Disclosure>
  )
}

// --- editing an item in place (#330) ------------------------------------------

type Editable = 'stated' | 'report' | 'veto' | 'seen'
type Veto = PersonPage['vetoes'][number]
type SeenItem = PersonPage['seen'][number]

const CLOSED = {
  open: null,
  closed: null,
  dirty: false,
  held: 0,
  warned: false,
} as const

type EditState = {
  /** The item open for editing: one at a time. */
  open: string | null
  /** The one just closed, whose "Editar" takes the focus back. */
  closed: string | null
  /** The open form has changes: leaving it would lose them. */
  dirty: boolean
  /** Bumped when leaving was refused for that: the form takes the focus
   * back. */
  held: number
  /** The form says why, until the next change in it. */
  warned: boolean
}

const Editing = createContext<{
  state: EditState
  /** The item an edit just saved (`?item=`). */
  saved?: string
  /** Opens an item; with changes in the open one, holds it instead. */
  open: (id: string) => void
  /** Closes the open item, changes or not (Cancelar, a post that went). */
  close: () => void
  /** Esc: closes the open item unless it has changes. */
  leave: () => void
  touch: () => void
  /** Whether another item may act now: not while the open one has
   * changes, which it says. */
  free: (id: string) => boolean
}>({
  state: CLOSED,
  open: () => {},
  close: () => {},
  leave: () => {},
  touch: () => {},
  free: () => true,
})

function EditingItem({
  initial,
  saved,
  children,
}: {
  initial?: string
  saved?: string
  children: ReactNode
}) {
  const [state, setState] = useState<EditState>({
    ...CLOSED,
    open: initial ?? null,
  })
  const close = () => setState((was) => ({ ...CLOSED, closed: was.open }))
  const hold = (was: EditState) => ({
    ...was,
    held: was.held + 1,
    warned: true,
  })
  const holding = (id: string) =>
    state.open !== null && state.dirty && state.open !== id
  return (
    <Editing.Provider
      value={{
        state,
        saved,
        open: (id) =>
          setState((was) =>
            was.open !== null && was.dirty && was.open !== id
              ? hold(was)
              : { ...CLOSED, open: id, closed: was.open },
          ),
        close,
        leave: () =>
          setState((was) =>
            was.dirty ? hold(was) : { ...CLOSED, closed: was.open },
          ),
        touch: () =>
          setState((was) =>
            was.dirty && !was.warned
              ? was
              : { ...was, dirty: true, warned: false },
          ),
        free: (id) => {
          if (!holding(id)) return true
          setState(hold)
          return false
        },
      }}
    >
      {children}
    </Editing.Provider>
  )
}

/** Whether one of a ficha's items is open for editing: its add form stays
 * out of the way meanwhile, not to read as the same form. */
function useEditingIn() {
  const { open } = useContext(Editing).state
  return (items: readonly { factId: string }[]) =>
    open !== null && items.some((item) => item.factId === open)
}

/** An item's date, and the day of its last edit when it has one. */
const dates = (item: { date: string; edited?: string }) => [
  unbroken(shortDate(item.date)),
  item.edited === undefined
    ? null
    : unbroken(PERSON.edit.on(shortDate(item.edited))),
]

/** A date that does not break across lines: "editado 27 nov 2026" whole. */
const unbroken = (text: string) => text.replaceAll(' ', '\u00a0')

const itemAnchor = (id: string) => `item-${id.replace(':', '-')}`

/** An item of her file: its lines with "Editar" and "Tirar" beside them,
 * or, open, the form that corrects it in its place. Just saved, it says so
 * beside its actions. */
function EditableItem({
  slug,
  what,
  id,
  label,
  context,
  form,
  children,
}: {
  slug: string
  what: Editable
  id: string
  label: string
  /** What the open form keeps of the item's line, under its heading. */
  context: readonly (string | null)[]
  /** The form's fields, filled with what the item says. */
  form: ReactNode
  children: ReactNode
}) {
  const editing = useContext(Editing)
  const [asking, setAsking] = useState(false)
  if (editing.state.open === id)
    return (
      <EditForm slug={slug} what={what} id={id} label={label} context={context}>
        {form}
      </EditForm>
    )
  return (
    <Item
      id={itemAnchor(id)}
      actions={
        <span className="flex shrink-0 flex-wrap items-center gap-xs">
          {editing.saved === id && !asking && (
            <span
              role="status"
              className="inline-flex items-center gap-2xs font-display text-row-title text-ink motion-safe:animate-stick"
            >
              <Icon name="check" className="size-[18px]" />
              {PERSON.edit.saved}
            </span>
          )}
          {!asking && <EditOpen id={id} label={label} />}
          <RemoveForm
            slug={slug}
            what={what}
            id={id}
            label={label}
            onAsking={setAsking}
            mayAsk={() => editing.free(id)}
          />
        </span>
      }
    >
      {children}
    </Item>
  )
}

/** The first field a person types in, in the open item. */
const firstField = (item: HTMLElement | null) =>
  // A scale's chosen radio, not its first one ("sem Nota").
  item?.querySelector<HTMLElement>(
    'input:not([type=hidden]):not([type=radio]), input[type=radio]:checked, select, textarea',
  ) ?? null

const OPTION = buttonVariants({ variant: 'option' })
const LINK = buttonVariants({ variant: 'link' })

/** "Editar": opens the item's form. Before the JavaScript, a link the
 * server opens it for (`?editar=`). */
function EditOpen({ id, label }: { id: string; label: string }) {
  const hydrated = useHydrated()
  const editing = useContext(Editing)
  const button = useRef<HTMLButtonElement>(null)
  const back = editing.state.closed === id && editing.state.open === null
  useEffect(() => {
    if (back) button.current?.focus()
  }, [back])
  if (!hydrated)
    return (
      <a
        href={`?editar=${encodeURIComponent(id)}#${itemAnchor(id)}`}
        aria-label={PERSON.edit.label(label)}
        className={OPTION}
      >
        {PERSON.edit.open}
      </a>
    )
  return (
    <button
      ref={button}
      type="button"
      aria-label={PERSON.edit.label(label)}
      onClick={() => editing.open(id)}
      className={OPTION}
    >
      {PERSON.edit.open}
    </button>
  )
}

/** The open item: which one it is, then its form, filled, with "Gravar"
 * and "Cancelar". The first field takes the focus, and takes it back when
 * leaving was held for its changes; Esc leaves a form without them. */
function EditForm({
  slug,
  what,
  id,
  label,
  context,
  children,
}: {
  slug: string
  what: Editable
  id: string
  label: string
  context: readonly (string | null)[]
  children: ReactNode
}) {
  const editing = useContext(Editing)
  const { held, warned } = editing.state
  const hydrated = useHydrated()
  const item = useRef<HTMLLIElement>(null)
  // Opened (held 0), and each time leaving was held: the first field.
  useEffect(() => {
    if (held >= 0) firstField(item.current)?.focus()
  }, [held])
  return (
    <li
      ref={item}
      id={itemAnchor(id)}
      className="scroll-mt-2xl border-rule py-sm not-first:border-t"
    >
      <ActionForm
        slug={slug}
        action="editar"
        label={PERSON.edit.label(label)}
        onDone={editing.close}
        className="flex flex-col gap-xl rounded-field border-2 border-ink p-lg min-[480px]:p-xl"
      >
        <div className="flex flex-col gap-2xs">
          <p className="font-display text-row-title">
            {PERSON.edit.heading(PERSON.edit.kinds[what])}
          </p>
          <Meta parts={context} />
        </div>
        {warned && <Alert>{PERSON.edit.held}</Alert>}
        <input type="hidden" name="tipo" value={what} />
        <input type="hidden" name="id" value={id} />
        <div
          className="flex flex-col gap-xl"
          onInput={editing.touch}
          onChange={editing.touch}
          onKeyDown={(event) => {
            // Ctrl or ⌘ with Enter saves, from any field.
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault()
              event.currentTarget.closest('form')?.requestSubmit()
              return
            }
            if (event.key !== 'Escape') return
            // Esc in the target search closes its results, not the form.
            const field = event.target
            if (field instanceof HTMLInputElement && field.type === 'search')
              return
            event.preventDefault()
            editing.leave()
          }}
        >
          {children}
        </div>
        <span className="flex flex-wrap items-center gap-lg">
          <Submit variant="chosen">{PERSON.save}</Submit>
          {hydrated ? (
            <button type="button" onClick={editing.close} className={LINK}>
              {PERSON.edit.cancel}
            </button>
          ) : (
            <a href={`?#${itemAnchor(id)}`} className={LINK}>
              {PERSON.edit.cancel}
            </a>
          )}
        </span>
      </ActionForm>
    </li>
  )
}

/** What a Declarado is about, as its line says it: "ama Sofia Rangel". */
const statementAbout = (s: Statement) =>
  s.target === null
    ? null
    : `${s.reaction ? PERSON.reactions[s.reaction as Reaction] : PERSON.about} ${PERSON.plainLabel(s.label ?? s.target)}`

/** The target the search shows picked: the item's, with its label. */
const targetOf = (id: string | null, label: string | null): Target | null =>
  id === null ? null : { id, label: PERSON.plainLabel(label ?? id) }

/** A Declarado's or a Relato's fields, as the add form has them. */
function StatementFields({ s }: { s: Statement }) {
  return (
    <>
      <TextField
        name="texto"
        label={PERSON.text}
        required
        defaultValue={s.text}
      />
      <TargetField
        name="alvo"
        label={PERSON.statementTarget}
        hint={PERSON.targetHint}
        scope="all"
        initial={targetOf(s.target, s.label)}
      />
      <SelectField
        name="reacao"
        label={PERSON.reaction}
        options={REACTION_OPTIONS}
        defaultValue={s.reaction ?? ''}
      />
      <TextField
        name="fonte"
        label={PERSON.source}
        hint={PERSON.edit.sourceHint}
        defaultValue={s.source}
      />
    </>
  )
}

/** A Veto to an id or to a tag group, which the pills mark. */
const isId = (target: string) => /^(?:tt|Q)\d+$/.test(target)

function VetoFields({
  v,
  groups,
}: {
  v: Veto
  groups: PersonPage['tagGroups']
}) {
  const { vetoes } = PERSON
  return (
    <>
      <TextField
        name="texto"
        label={vetoes.text}
        required
        defaultValue={v.text}
      />
      <TargetField
        name="alvo"
        label={PERSON.target}
        scope="all"
        groups={groups}
        initial={isId(v.target) ? targetOf(v.target, v.label) : null}
        initialGroup={isId(v.target) ? '' : v.target}
      />
    </>
  )
}

/** A Já visto's Nota and Fonte; its film stays, said above them. */
function SeenFields({ s }: { s: SeenItem }) {
  return (
    <>
      <p className="flex flex-col gap-2xs">
        <span className="font-display text-field-label">{PERSON.film}</span>
        <span>{s.title}</span>
        <span className="text-meta text-ink-2">{PERSON.edit.filmFixed}</span>
      </p>
      <RatingField
        name="nota"
        label={PERSON.rating}
        defaultValue={s.rating === null ? '' : `${Math.round(s.rating * 2)}/10`}
      />
      <TextField
        name="fonte"
        label={PERSON.source}
        hint={PERSON.edit.sourceHint}
        defaultValue={s.source}
      />
    </>
  )
}
