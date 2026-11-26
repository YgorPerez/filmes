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
  ...RATING_CHOICES.map((value) => ({ value, label: value })),
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
    <main className="mx-auto flex max-w-[720px] flex-col gap-2xl px-2xl py-3xl">
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
          <Notes slug={slug} own={own} ratings={page.ratings} />
          {own && start && <MyStartSections start={start} person={slug} />}
          <Contents page={page} />
          <Details slug={slug} page={page} search={search} />
        </ActionForms>
      )}
    </main>
  )
}

/** Her name (on Meu gosto, the page's name, then hers) and aliases, and
 * what the last form did. */
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
        <h1 className="flex flex-wrap items-center gap-sm font-display text-title">
          {own ? PERSON.myTaste : page.name}
          {!own && page.owner && <OwnerTag />}
        </h1>
        {(own || aliases) && (
          <Meta parts={own ? [page.name, aliases] : [aliases]} />
        )}
      </div>
      {refusal && !stale && <Alert>{PERSON.refusals[refusal]}</Alert>}
      {notice && !stale && <Notice>{PERSON.notices[notice]}</Notice>}
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
}: {
  slug: string
  own: boolean
  ratings: PersonPage['ratings']
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
                <span>
                  {r.title ?? r.filmId}{' '}
                  <span className="text-ink-2">({r.filmId})</span>
                </span>
                <Meta parts={[PERSON.ratingText(r.rating), r.date, r.source]} />
              </Item>
            ))}
          </ul>
        </Disclosure>
      )}
    </Slip>
  )
}

/** The page's fichas as a row of links, each with how many it holds: the
 * page is long, and the Dono comes for one of them. */
function Contents({ page }: { page: PersonPage }) {
  const own = page.person === page.viewer.person
  const entries: readonly (readonly [string, string, number | null])[] = [
    ['perguntas', PERSON.questions.title, page.openQuestions.length],
    ['vetos', PERSON.vetoes.title, page.vetoes.length],
    ['ajustes', PERSON.adjustments.title, page.adjustments.length],
    ['declarados', PERSON.stated.title, page.stated.length],
    ...(own && page.reports.length === 0
      ? []
      : [['relatos', PERSON.reports.title, page.reports.length] as const]),
    ['vistos', PERSON.seen.title, page.seen.length],
    ...(page.access === undefined
      ? []
      : [['acesso', PERSON.access.title, null] as const]),
  ]
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
 * search that finds the IDs their forms take. */
function Details({
  slug,
  page,
  search,
}: {
  slug: string
  page: PersonPage
  search: SearchAnswer | null
}) {
  return (
    <>
      <CatalogSearch
        action={personPath(slug, page.person === page.viewer.person)}
        scope="all"
        answer={search}
      />
      <OpenQuestions slug={slug} page={page} />
      <Vetoes slug={slug} page={page} />
      <Adjustments slug={slug} page={page} />
      <Statements
        slug={slug}
        kind="stated"
        items={page.stated}
        source={PERSON.stated.source}
      />
      <Reports slug={slug} page={page} />
      <Seen slug={slug} page={page} />
      <Access slug={slug} page={page} />
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
                q.date,
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
            <Meta parts={[`${v.label} (${v.target})`, v.date]} />
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
  return (
    <Slip
      id="ajustes"
      title={adjustments.title}
      aside={countOf(page.adjustments)}
      lead={adjustments.lead}
    >
      <ul className="flex flex-col">
        {Object.entries(PERSON.links).map(([link, name]) => {
          const current = page.adjustments.find((a) => a.link === link)
          return (
            <li key={link} className="border-rule py-md not-first:border-t">
              <ActionForm
                slug={slug}
                action="ajustar"
                className="flex flex-wrap items-end gap-sm"
              >
                <input type="hidden" name="elo" value={link} />
                <LevelPicker
                  legend={adjustments.level(name)}
                  hint={current?.date}
                  level={current?.level ?? 'normal'}
                />
                <Submit className="">{adjustments.change}</Submit>
              </ActionForm>
            </li>
          )
        })}
      </ul>
    </Slip>
  )
}

/** The four levels of an Ajuste side by side, one marked: radios, so the
 * form posts the marked one without JavaScript. */
function LevelPicker({
  legend,
  hint,
  level,
}: {
  legend: string
  hint?: string
  level: string
}) {
  return (
    <fieldset className="flex min-w-0 flex-1 basis-[240px] flex-col gap-xs">
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

function statementTarget(s: Statement) {
  if (s.target === null) return null
  const reaction = s.reaction
    ? PERSON.reactions[s.reaction as Reaction]
    : PERSON.noReaction
  return `${reaction} ${s.label} (${s.target})`
}

function Statements({
  slug,
  kind,
  items,
  source,
}: {
  slug: string
  kind: 'stated' | 'report'
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
      lead={copy.lead}
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
                    s.date,
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
    <Slip id="vistos" title={seen.title} aside={countOf(page.seen)}>
      <Items empty={seen.empty}>
        {page.seen.map((s) => (
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
            <span>
              {s.title} <span className="text-ink-2">({s.film})</span>
            </span>
            <Meta
              parts={[
                s.rating === null ? null : PERSON.ratingText(s.rating),
                s.date,
                s.source,
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
 * is refused. The admin's own access never leaves from here. */
function Access({ slug, page }: { slug: string; page: PersonPage }) {
  const { access } = page
  if (!page.viewer.admin || access === undefined) return null
  const copy = PERSON.access
  return (
    <Slip id="acesso" title={copy.title} lead={copy.lead}>
      {page.owner ? (
        <>
          <p>{copy.owner(access.email)}</p>
          {page.person === page.viewer.person ? (
            <p className="text-meta text-ink-2">{copy.self}</p>
          ) : (
            <ActionForm slug={slug} action="tirar-acesso" label={copy.revoke}>
              <p className="text-meta text-ink-2">{copy.revokeHint}</p>
              <Submit>{copy.revoke}</Submit>
            </ActionForm>
          )}
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
