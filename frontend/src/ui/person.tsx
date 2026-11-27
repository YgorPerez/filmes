import { useHydrated } from '@tanstack/react-router'
import { Fragment, type ReactNode } from 'react'
import type { PersonNotice, PersonRefusal } from '#/content/person-action'
import {
  imdbCsvPath,
  importsPath,
  personPath,
  RATINGS_PATH,
} from '#/content/paths'
import type { SearchAnswer } from '#/platform/catalog-search'
import type { PersonPage } from '#/platform/people'
import { OwnerTag } from './kit/owner-tag'
import { Slip } from './kit/slip'
import {
  ActionForm,
  ActionForms,
  Alert,
  CatalogSearch,
  Disclosure,
  Item,
  Items,
  Meta,
  Notice,
  RemoveForm,
  SelectField,
  Submit,
  TextField,
  useRefusedInPlace,
} from './person-parts'
import { MyStartSections, type MyStart } from './my-start'
import { StrengthDots } from './person-marks'
import { PERSON, RATING_CHOICES } from './person.copy'
import { buttonVariants } from './kit/button-variants'
import { shortDate } from './dates'

type Statement = PersonPage['stated'][number]
type Reaction = keyof typeof PERSON.reactions

const ID_PATTERN = '(tt|Q)[0-9]+'

const REACTION_OPTIONS = [
  { value: '', label: PERSON.noReaction },
  ...Object.entries(PERSON.reactions).map(([value, label]) => ({
    value,
    label,
  })),
]

const RATING_OPTIONS = [
  { value: '', label: PERSON.noRating },
  ...RATING_CHOICES,
]

/** `/pessoas/<slug>`, or Meu gosto for the Dono's own: her Notas first
 * (rate, import, the CSV), then, on Meu gosto, the setup guide's leftovers
 * (`start`), then what the filmes knows of her taste, with a form for each
 * `pessoa` action. Every form is a plain POST that comes back here with
 * `notice` or `refusal`; with the JavaScript, it goes by `fetch` and
 * reloads the page in place (`ActionForm`). `page` is `'unknown'` when no Pessoa has the slug,
 * null when the engine cannot run on this server. `search` is the Catálogo
 * search of `?buscar=`, for the targets' IDs. */
export function PersonScreen({
  slug,
  page,
  notice,
  refusal,
  search = null,
  start,
}: {
  slug: string
  page: PersonPage | 'unknown' | null
  notice?: PersonNotice
  refusal?: PersonRefusal
  search?: SearchAnswer | null
  /** Meu gosto's part of the setup guide; only on her own page. */
  start?: MyStart
}) {
  const own =
    typeof page === 'object' &&
    page !== null &&
    page.person === page.viewer.person
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
      ) : page === 'unknown' ? (
        <Alert>{PERSON.unknown}</Alert>
      ) : (
        <ActionForms>
          <PersonHeader
            page={page}
            own={own}
            notice={notice}
            refusal={refusal}
          />
          {/* From 900px, two columns: her Notas and what the guide left
              on the left, the taste on the right. */}
          <div className="grid gap-2xl min-[900px]:grid-cols-2 min-[900px]:items-start">
            <div className="flex min-w-0 flex-col gap-2xl">
              {own && <Glance page={page} start={start} />}
              <Notes
                slug={slug}
                own={own}
                ratings={page.ratings}
                predictionError={page.predictionError}
              />
              {own && start && <MyStartSections start={start} person={slug} />}
            </div>
            <div className="flex min-w-0 flex-col gap-2xl">
              <Contents page={page} />
              <Details slug={slug} page={page} search={search} />
            </div>
          </div>
        </ActionForms>
      )}
    </main>
  )
}

const noticeOfOwn = (notice: PersonNotice): string | undefined =>
  (PERSON.ownNotices as Partial<Record<PersonNotice, string>>)[notice]

/** Her name (on Meu gosto, the page's name, then the name the Sessões give
 * her) and aliases, and what the last form did. */
function PersonHeader({
  page,
  own,
  notice,
  refusal,
}: {
  page: PersonPage
  own: boolean
  notice?: PersonNotice
  refusal?: PersonRefusal
}) {
  const aliases = page.aliases.length > 0 ? PERSON.aliases(page.aliases) : null
  // A form's refusal in place says what the last post did now.
  const stale = useRefusedInPlace()
  return (
    <>
      <div className="flex flex-col gap-xs">
        <h1 className="flex flex-wrap items-center gap-sm font-display text-page-title">
          {own ? PERSON.myTaste : page.name}
          {!own && page.owner && <OwnerTag />}
        </h1>
        {own ? (
          <Meta parts={[PERSON.ownName(page.name, page.aliases)]} />
        ) : (
          aliases && <Meta parts={[aliases]} />
        )}
      </div>
      {refusal && !stale && <Alert>{PERSON.refusals[refusal]}</Alert>}
      {notice && !stale && (
        <Notice>
          {(own ? noticeOfOwn(notice) : undefined) ?? PERSON.notices[notice]}
        </Notice>
      )}
    </>
  )
}

/** Her Notas and where they come and go: Dar notas (only on Meu gosto: the
 * queue writes for the Dono logged in), her import, and the IMDb CSV once
 * she has a Nota. The list itself opens on demand: it can be long. */
function Notes({
  slug,
  own,
  ratings,
  predictionError,
}: {
  slug: string
  own: boolean
  ratings: PersonPage['ratings']
  predictionError: PersonPage['predictionError']
}) {
  const { notes } = PERSON
  const option = buttonVariants({ variant: 'option' })
  return (
    <Slip
      id="notas"
      title={notes.title}
      aside={ratings === null ? undefined : String(ratings.length)}
    >
      {ratings === null && <p className="text-ink-2">{notes.noDatabase}</p>}
      {ratings?.length === 0 && (
        <p className="text-ink-2">{notes.empty(own)}</p>
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
          <a href={RATINGS_PATH} className={buttonVariants()}>
            {notes.rate}
          </a>
        )}
        <a href={importsPath(slug, own)} className={option}>
          {notes.import}
        </a>
        {ratings !== null && ratings.length > 0 && (
          <a href={imdbCsvPath(slug)} className={option}>
            {notes.download}
          </a>
        )}
      </div>
      {ratings !== null && ratings.length > 0 && (
        <p className="text-meta text-ink-2">{notes.movielens}</p>
      )}
      {ratings !== null && ratings.length > 0 && (
        <Disclosure summary={notes.list(ratings.length)}>
          <ul className="flex flex-col">
            {ratings.map((r) => (
              <Item key={r.factId}>
                <span>{r.title ?? r.filmId}</span>
                <Meta
                  parts={[
                    PERSON.ratingText(r.rating),
                    shortDate(r.date),
                    PERSON.ratingSource(r.rating, r.source),
                  ]}
                />
              </Item>
            ))}
          </ul>
        </Disclosure>
      )}
    </Slip>
  )
}

/** A Nota of the rating screen is a Já visto too; the Notas list shows it,
 * so Já vistos leaves it out. The engine's `RATING_SCREEN_SOURCE`. */
const SITE_RATINGS = 'notas no site'

/** The Já vistos her page lists: what she said she saw, not her Notas. */
const seenOf = (page: PersonPage) =>
  page.seen.filter((s) => s.source !== SITE_RATINGS)

/** The fichas of her taste, in the page's order, each with how many it
 * holds. Relatos only where a form can add one or one was told; Acesso
 * only for an admin on another Pessoa's page. */
function tasteParts(page: PersonPage) {
  const own = page.person === page.viewer.person
  return [
    ['perguntas', PERSON.questions.title, page.openQuestions.length],
    ['vetos', PERSON.vetoes.title, page.vetoes.length],
    ['declarados', PERSON.stated.title, page.stated.length],
    ...(own && page.reports.length === 0
      ? []
      : [['relatos', PERSON.reports.title, page.reports.length] as const]),
    ['vistos', PERSON.seen.title, seenOf(page).length],
  ] as const
}

/** How many elos she moved off normal (the engine lists only those). */
const changedAdjustments = (page: PersonPage) => page.adjustments.length

/** Meu gosto's opening ficha: how many Notas (and how many to 10), what
 * she said of her taste, and the one next step. */
function Glance({ page, start }: { page: PersonPage; start?: MyStart }) {
  const { glance } = PERSON
  const notes = page.ratings?.length ?? 0
  const said = tasteParts(page)
    .filter(([id, , n]) => n > 0 && id !== 'perguntas')
    .map(([, title, n]) => `${n} ${title}`)
  const connector = start?.setup?.steps.find((s) => s.step === 'connector')
  const [step, href] =
    notes < 10
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
        {notes < 10 && (
          <span className="font-body text-meta font-normal text-ink-2">
            {' · '}
            {glance.toTen(notes)}
          </span>
        )}
      </p>
      <p className="text-ink-2">
        {said.length === 0
          ? glance.nothingSaid
          : `${glance.said}: ${said.join(' · ')}`}
      </p>
      <p>
        {glance.next}:{' '}
        <a href={href} className="text-ink underline underline-offset-3">
          {step}
        </a>
      </p>
    </Slip>
  )
}

/** The fichas that hold something, as a row of links with how many: the
 * page is long, and the Dono comes for one of them. The empty ones are in
 * one fold (`Details`). */
function Contents({ page }: { page: PersonPage }) {
  const own = page.person === page.viewer.person
  const all: readonly (readonly [string, string, number | null])[] = [
    ...tasteParts(page).filter(([, , n]) => n > 0),
    ['ajustes', PERSON.adjustments.title, changedAdjustments(page)],
    ...(page.access === undefined || own
      ? []
      : [['acesso', PERSON.access.title, null] as const]),
  ]
  const entries = all.filter(([, , n]) => n !== 0)
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
              {title}
              {n !== null && ' '}
              {n !== null && (
                <span className="text-ink-2 tabular-nums">{n}</span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** The Pessoa's sections, one per kind of taste, after the Catálogo
 * search that finds the IDs their forms take. The fichas with nothing yet
 * fold into one line ("Vetos e Declarados: nada ainda"), each still with
 * its form inside. */
function Details({
  slug,
  page,
  search,
}: {
  slug: string
  page: PersonPage
  search: SearchAnswer | null
}) {
  const own = page.person === page.viewer.person
  const sections: Record<string, ReactNode> = {
    perguntas: <OpenQuestions slug={slug} page={page} />,
    vetos: <Vetoes slug={slug} page={page} />,
    declarados: (
      <Statements
        slug={slug}
        kind="stated"
        own={own}
        items={page.stated}
        source={PERSON.stated.source}
      />
    ),
    relatos: <Reports slug={slug} page={page} />,
    vistos: <Seen slug={slug} page={page} />,
  }
  const parts = tasteParts(page)
  const empty = parts.filter(([, , n]) => n === 0)
  return (
    <>
      <CatalogSearch
        action={personPath(slug, own)}
        scope="all"
        answer={search}
      />
      {parts
        .filter(([, , n]) => n > 0)
        .map(([id]) => (
          <Fragment key={id}>{sections[id]}</Fragment>
        ))}
      <Adjustments slug={slug} page={page} />
      {empty.length > 0 && (
        <Disclosure summary={PERSON.empties(empty.map(([, title]) => title))}>
          <div className="flex flex-col gap-2xl">
            {empty.map(([id]) => (
              <Fragment key={id}>{sections[id]}</Fragment>
            ))}
          </div>
        </Disclosure>
      )}
      {!own && <Access slug={slug} page={page} />}
    </>
  )
}

type Part = { slug: string; page: PersonPage }

/** How many a ficha holds, on its stub. */
const countOf = (items: readonly unknown[]) => String(items.length)

/** What others told of her taste. On the logged-in Dono's own page there is
 * no form (what she says of herself is a Declarado), and no section until
 * another Dono tells something. */
function Reports({ slug, page }: Part) {
  const own = page.person === page.viewer.person
  if (own && page.reports.length === 0) return null
  return (
    <Statements
      slug={slug}
      kind="report"
      own={own}
      items={page.reports}
      source={own ? null : PERSON.reports.source(page.viewer.name)}
    />
  )
}

function OpenQuestions({ slug, page }: Part) {
  const { questions } = PERSON
  return (
    <Slip
      id="perguntas"
      title={questions.title}
      aside={countOf(page.openQuestions)}
    >
      <Items empty={questions.empty}>
        {page.openQuestions.map((q) => (
          <Item key={q.factId}>
            <span>{q.text}</span>
            <Meta
              parts={[
                q.label && q.subject && `${q.label} (${q.subject})`,
                questions.skips(q.skips),
                shortDate(q.date),
              ]}
            />
            <div className="mt-sm flex flex-col gap-sm">
              <Disclosure summary={questions.answer}>
                <ActionForm
                  slug={slug}
                  action="responder"
                  label={`${questions.answer}: ${q.text}`}
                >
                  <input type="hidden" name="pergunta" value={q.factId} />
                  <TextField
                    name="texto"
                    label={questions.answerText}
                    required
                  />
                  {q.subject?.startsWith('Q') && (
                    <SelectField
                      name="reacao"
                      label={PERSON.reaction}
                      hint={q.label ?? q.subject}
                      options={REACTION_OPTIONS}
                    />
                  )}
                  <Submit>{PERSON.save}</Submit>
                </ActionForm>
              </Disclosure>
              <ActionForm
                slug={slug}
                action="pular"
                className="self-start"
                busy={questions.skipping}
              >
                <input type="hidden" name="texto" value={q.text} />
                {q.subject && (
                  <input type="hidden" name="assunto" value={q.subject} />
                )}
                <Submit
                  variant="link"
                  className=""
                  aria-label={`${questions.skip}: ${q.text}`}
                >
                  {questions.skip}
                </Submit>
              </ActionForm>
            </div>
          </Item>
        ))}
      </Items>
    </Slip>
  )
}

function Vetoes({ slug, page }: Part) {
  const { vetoes } = PERSON
  return (
    <Slip id="vetos" title={vetoes.title} aside={countOf(page.vetoes)}>
      <Items empty={vetoes.empty}>
        {page.vetoes.map((v) => (
          <Item
            key={v.factId}
            actions={
              <RemoveForm
                slug={slug}
                what="veto"
                id={v.factId}
                label={v.text}
              />
            }
          >
            <span>“{v.text}”</span>
            <Meta parts={[`${v.label} (${v.target})`, shortDate(v.date)]} />
          </Item>
        ))}
      </Items>
      <Disclosure summary={vetoes.add}>
        <ActionForm slug={slug} action="vetar" label={vetoes.add}>
          <TextField
            name="texto"
            label={vetoes.text}
            placeholder={vetoes.placeholder}
            required
          />
          <TextField
            name="alvo"
            label={PERSON.target}
            hint={PERSON.idHint}
            pattern={ID_PATTERN}
          />
          <SelectField
            name="grupo"
            label={PERSON.group}
            options={[
              { value: '', label: PERSON.noGroup },
              ...page.tagGroups.map(({ key, label }) => ({
                value: key,
                label,
              })),
            ]}
          />
          <Submit>{PERSON.save}</Submit>
        </ActionForm>
      </Disclosure>
    </Slip>
  )
}

function Adjustments({ slug, page }: Part) {
  const { adjustments } = PERSON
  const own = page.person === page.viewer.person
  const levelOf = (link: string) =>
    page.adjustments.find((a) => a.link === link)
  const changed = (link: string) => levelOf(link) !== undefined
  const links = Object.entries(PERSON.links)
  const row = ([link, name]: [string, string]) => (
    <li key={link} className="border-rule py-md not-first:border-t">
      <AdjustmentForm
        slug={slug}
        link={link}
        legend={adjustments.level(name)}
        current={levelOf(link)}
      />
    </li>
  )
  const rest = links.filter(([link]) => !changed(link))
  return (
    <Slip
      id="ajustes"
      title={adjustments.title}
      aside={String(changedAdjustments(page))}
      lead={own ? adjustments.ownLead : adjustments.lead}
    >
      {rest.length < links.length && (
        <ul className="flex flex-col">
          {links.filter(([link]) => changed(link)).map(row)}
        </ul>
      )}
      {rest.length > 0 && (
        <Disclosure
          summary={
            rest.length === links.length
              ? adjustments.allNormal
              : adjustments.restNormal
          }
        >
          <ul className="flex flex-col">{rest.map(row)}</ul>
        </Disclosure>
      )}
    </Slip>
  )
}

/** One Ajuste: its four levels. With the JavaScript, a tap on a level
 * saves it; before, "Mudar" posts the form. */
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
  return (
    <ActionForm
      slug={slug}
      action="ajustar"
      className="flex flex-wrap items-end gap-sm"
    >
      <input type="hidden" name="elo" value={link} />
      <LevelPicker
        legend={legend}
        hint={current && shortDate(current.date)}
        level={current?.level ?? 'normal'}
        onPick={hydrated ? (form) => form?.requestSubmit() : undefined}
      />
      {!hydrated && <Submit className="">{PERSON.adjustments.change}</Submit>}
    </ActionForm>
  )
}

/** The four levels of an Ajuste side by side, one marked: radios, so the
 * form posts the marked one without JavaScript. */
function LevelPicker({
  legend,
  hint,
  level,
  onPick,
}: {
  legend: string
  hint?: string
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
        {hint && (
          <span className="font-body font-normal text-ink-2"> {hint}</span>
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
            <span className="flex min-h-[38px] flex-1 cursor-pointer items-center justify-center rounded-pill px-xs font-display text-control text-ink-2 select-none peer-checked:bg-surface-2 peer-checked:font-bold peer-checked:text-ink peer-checked:ring-2 peer-checked:ring-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus">
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

/** What the statement is about, in plain words: "ama Sofia Rangel", "só
 * sobre a tag “chuva”". The ID stays out: the forms that need it find it
 * in the Catálogo search. */
function statementTarget(s: Statement) {
  if (s.target === null) return null
  const reaction = s.reaction
    ? PERSON.reactions[s.reaction as Reaction]
    : PERSON.noReaction
  return `${reaction} ${PERSON.plainLabel(s.label ?? s.target)}`
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
  const copy = kind === 'stated' ? PERSON.stated : PERSON.reports
  return (
    <Slip
      id={kind === 'stated' ? 'declarados' : 'relatos'}
      title={copy.title}
      aside={countOf(items)}
      lead={own ? copy.ownLead : copy.lead}
    >
      <Items empty={copy.empty}>
        {items.map((s) => {
          const origin = originOf(kind, s)
          return (
            <Item
              key={s.factId}
              actions={
                origin === 'file' ? (
                  <RemoveForm
                    slug={slug}
                    what={kind}
                    id={s.factId}
                    label={s.text}
                  />
                ) : (
                  <span className="font-display text-label text-ink-2 uppercase">
                    {origin}
                  </span>
                )
              }
            >
              <span>“{s.text}”</span>
              <span className="flex flex-wrap items-center gap-x-sm gap-y-2xs">
                <StrengthDots
                  strength={s.strength}
                  word={PERSON.strengths[s.strength]}
                />
                <Meta
                  parts={[
                    statementTarget(s),
                    s.specific ? PERSON.specific : PERSON.generic,
                    shortDate(s.date),
                    s.source,
                  ]}
                />
              </span>
            </Item>
          )
        })}
      </Items>
      {source !== null && (
        <Disclosure summary={copy.add}>
          <ActionForm
            slug={slug}
            action={kind === 'stated' ? 'declarar' : 'relatar'}
            label={copy.add}
          >
            <TextField name="texto" label={PERSON.text} required />
            <TextField
              name="alvo"
              label={PERSON.target}
              hint={PERSON.targetHint}
              pattern={ID_PATTERN}
            />
            <SelectField
              name="reacao"
              label={PERSON.reaction}
              options={REACTION_OPTIONS}
            />
            <TextField
              name="fonte"
              label={PERSON.source}
              hint={PERSON.sourceHint(source)}
            />
            <Submit>{PERSON.save}</Submit>
          </ActionForm>
        </Disclosure>
      )}
    </Slip>
  )
}

function Seen({ slug, page }: Part) {
  const { seen } = PERSON
  return (
    <Slip id="vistos" title={seen.title} aside={countOf(seenOf(page))}>
      <Items empty={seen.empty}>
        {seenOf(page).map((s) => (
          <Item
            key={s.factId}
            actions={
              <RemoveForm
                slug={slug}
                what="seen"
                id={s.factId}
                label={s.title}
              />
            }
          >
            <span>{s.title}</span>
            <Meta
              parts={[
                s.rating === null ? null : PERSON.ratingText(s.rating),
                shortDate(s.date),
                s.rating === null
                  ? s.source
                  : PERSON.ratingSource(s.rating, s.source),
              ]}
            />
          </Item>
        ))}
      </Items>
      <Disclosure summary={seen.add}>
        <ActionForm slug={slug} action="visto" label={seen.add}>
          <TextField
            name="filme"
            label={PERSON.film}
            hint={PERSON.filmHint}
            pattern="tt[0-9]+"
            required
          />
          <SelectField
            name="nota"
            label={PERSON.rating}
            options={RATING_OPTIONS}
          />
          <TextField
            name="fonte"
            label={PERSON.source}
            hint={PERSON.sourceHint(seen.source)}
          />
          <Submit>{PERSON.save}</Submit>
        </ActionForm>
      </Disclosure>
    </Slip>
  )
}

/** The Acesso section of a Pessoa's page (#166), for an admin only: give
 * her a Google e-mail and she is a Dono; take it away and her next request
 * is refused. Not on Meu gosto: her own access never leaves from here. */
function Access({ slug, page }: { slug: string; page: PersonPage }) {
  const { access } = page
  if (!page.viewer.admin || access === undefined) return null
  const copy = PERSON.access
  return (
    <Slip id="acesso" title={copy.title} lead={copy.lead}>
      {page.owner ? (
        <>
          <p>{copy.owner(access.email)}</p>
          <ActionForm slug={slug} action="tirar-acesso" label={copy.revoke}>
            <p className="text-meta text-ink-2">{copy.revokeHint}</p>
            <Submit>{copy.revoke}</Submit>
          </ActionForm>
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
            <Submit variant="primary">{copy.grant}</Submit>
          </ActionForm>
        </>
      )}
    </Slip>
  )
}
