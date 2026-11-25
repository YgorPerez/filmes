import type { PersonNotice, PersonRefusal } from '#/content/person-action'
import type { SearchAnswer } from '#/platform/catalog-search'
import type { PersonPage } from '#/platform/people'
import { Marquee } from './marquee'
import {
  ActionForm,
  Alert,
  CatalogSearch,
  Disclosure,
  Item,
  Items,
  Meta,
  Notice,
  OwnerTag,
  RemoveForm,
  Section,
  SelectField,
  Submit,
  TextField,
} from './person-parts'
import { PERSON, RATING_CHOICES } from './person.copy'
import { Button, buttonVariants } from './shadcn/button'

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

/** `/pessoas/<slug>`: what the filmes knows of the Pessoa's taste, and a
 * form for each `pessoa` action. Every form is a plain POST that comes back
 * here with `notice` or `refusal`. `page` is `'unknown'` when no Pessoa has
 * the slug, null when the engine cannot run on this server. `search` is the
 * Catálogo search of `?buscar=`, for the targets' IDs. */
export function PersonScreen({
  slug,
  page,
  notice,
  refusal,
  search = null,
}: {
  slug: string
  page: PersonPage | 'unknown' | null
  notice?: PersonNotice
  refusal?: PersonRefusal
  search?: SearchAnswer | null
}) {
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-xl px-lg py-xl">
      <header className="flex flex-wrap items-center justify-between gap-md">
        <Marquee words={['filmes']} />
        <a href="/pessoas" className={buttonVariants({ variant: 'quiet' })}>
          {PERSON.back}
        </a>
      </header>
      {page === null ? (
        <Alert>{PERSON.unavailable}</Alert>
      ) : page === 'unknown' ? (
        <Alert>{PERSON.unknown}</Alert>
      ) : (
        <>
          <PersonHeader page={page} notice={notice} refusal={refusal} />
          <CatalogSearch
            action={`/pessoas/${encodeURIComponent(slug)}`}
            scope="all"
            answer={search}
          />
          <Details slug={slug} page={page} />
        </>
      )}
    </main>
  )
}

/** Her name and aliases, and what the last form did. */
function PersonHeader({
  page,
  notice,
  refusal,
}: {
  page: PersonPage
  notice?: PersonNotice
  refusal?: PersonRefusal
}) {
  return (
    <>
      <div className="flex flex-col gap-xs">
        <h1 className="flex flex-wrap items-center gap-sm text-title">
          {page.name}
          {page.owner && <OwnerTag />}
        </h1>
        {page.aliases.length > 0 && (
          <p className="text-meta text-ink-2">{PERSON.aliases(page.aliases)}</p>
        )}
      </div>
      {refusal && <Alert>{PERSON.refusals[refusal]}</Alert>}
      {notice && <Notice>{PERSON.notices[notice]}</Notice>}
    </>
  )
}

/** The Pessoa's sections, one per kind of taste. */
function Details({ slug, page }: { slug: string; page: PersonPage }) {
  return (
    <>
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
      <Ratings ratings={page.ratings} />
    </>
  )
}

type Part = { slug: string; page: PersonPage }

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
    <Section id="perguntas" title={questions.title}>
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
              <ActionForm slug={slug} action="pular" className="self-start">
                <input type="hidden" name="texto" value={q.text} />
                {q.subject && (
                  <input type="hidden" name="assunto" value={q.subject} />
                )}
                <Button
                  type="submit"
                  variant="quiet"
                  aria-label={`${questions.skip}: ${q.text}`}
                >
                  {questions.skip}
                </Button>
              </ActionForm>
            </div>
          </Item>
        ))}
      </Items>
    </Section>
  )
}

function Vetoes({ slug, page }: Part) {
  const { vetoes } = PERSON
  return (
    <Section id="vetos" title={vetoes.title}>
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
    </Section>
  )
}

function Adjustments({ slug, page }: Part) {
  const { adjustments } = PERSON
  const levels = Object.entries(PERSON.levels).map(([value, label]) => ({
    value,
    label,
  }))
  return (
    <Section id="ajustes" title={adjustments.title} lead={adjustments.lead}>
      <ul className="flex flex-col">
        {Object.entries(PERSON.links).map(([link, name]) => {
          const current = page.adjustments.find((a) => a.link === link)
          return (
            <li key={link} className="border-rule py-sm not-first:border-t">
              <ActionForm
                slug={slug}
                action="ajustar"
                className="flex flex-wrap items-end gap-sm"
              >
                <input type="hidden" name="elo" value={link} />
                <div className="min-w-0 flex-1 basis-[180px]">
                  <SelectField
                    name="nivel"
                    label={adjustments.level(name)}
                    hint={current?.date}
                    options={levels}
                    defaultValue={current?.level ?? 'normal'}
                  />
                </div>
                <Button type="submit" variant="quiet">
                  {adjustments.change}
                </Button>
              </ActionForm>
            </li>
          )
        })}
      </ul>
    </Section>
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
    <Section
      id={kind === 'stated' ? 'declarados' : 'relatos'}
      title={copy.title}
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
                  <span className="text-label text-ink-2 uppercase">
                    {origin}
                  </span>
                )
              }
            >
              <span>“{s.text}”</span>
              <Meta
                parts={[
                  statementTarget(s),
                  s.specific ? PERSON.specific : PERSON.generic,
                  PERSON.strengths[s.strength],
                  s.date,
                  s.source,
                ]}
              />
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
    </Section>
  )
}

function Seen({ slug, page }: Part) {
  const { seen } = PERSON
  return (
    <Section id="vistos" title={seen.title}>
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
    </Section>
  )
}

function Ratings({ ratings }: { ratings: PersonPage['ratings'] }) {
  const copy = PERSON.ratings
  return (
    <Section id="notas" title={copy.title} lead={copy.lead}>
      {ratings === null ? (
        <p className="text-ink-2">{copy.noDatabase}</p>
      ) : ratings.length === 0 ? (
        <p className="text-ink-2">{copy.empty}</p>
      ) : (
        <Disclosure summary={copy.count(ratings.length)}>
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
    </Section>
  )
}
