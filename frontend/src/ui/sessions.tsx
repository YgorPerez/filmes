import type { ReactNode } from 'react'
import {
  DEFAULT_SERIES_ORDER_CHOICE,
  MAX_CHILD_AGE,
  RULE_CHOICES,
  SERIES_ORDER_CHOICES,
  type SeriesOrderChoice,
  type SessionRequestForm,
  type SessionRequestRefusal,
} from '#/content/session-request'
import type { ReplyRefusal, SessionNotice } from '#/content/billboard-reply'
import { feedbackPath, sessionPath } from '#/content/session-paths'
import { similarParam } from '#/content/catalog-search'
import type { CartazPage } from '#/platform/billboard'
import type { SearchAnswer } from '#/platform/catalog-search'
import type { PageReading } from '#/platform/reading'
import type {
  NewSessionDraft,
  RequestOptions,
  SessionItem,
} from '#/platform/sessions'
import { Billboard } from './billboard'
import { CATALOG_SEARCH } from './catalog-search.copy'
import { ImportsFrame } from './imports'
import { Option } from './kit/option'
import { OwnerTag } from './kit/owner-tag'
import { Slip } from './kit/slip'
import {
  Alert,
  CatalogSearch,
  Item,
  LinkButton,
  Meta,
  Notice,
  Section,
  SelectField,
  Submit,
  TextField,
} from './person-parts'
import {
  Avatars,
  DateLabel,
  GroupHeading,
  names,
  NewSessionLink,
  NightRequest,
  ReturnBox,
  SearchFold,
  ShelfRow,
} from './session-parts'
import { PairwiseAnswers } from './pairwise-answers'
import { ShareSessionLink } from './session-link-share'
import { SESSIONS } from './sessions.copy'

const sessionHref = sessionPath
const feedbackHref = feedbackPath

/** What a closed Session ended with: the chosen film or nothing. */
const outcome = (s: SessionItem) =>
  s.chosen ? SESSIONS.list.chosen(s.chosen.title) : SESSIONS.list.nothing

/** An open Session: its ficha, with the Presentes and the date on the
 * stub (a link to its page), the request on the shelf label with the
 * Dono's words on the yellow paper, and the box to return it (its
 * Feedback, #115's form, outside `/sessoes`). */
function OpenRow({ session: s }: { session: SessionItem }) {
  const { list } = SESSIONS
  const films = SESSIONS.films(s.recommendation.length)
  return (
    <li>
      <Slip
        as="article"
        head={
          <a
            href={sessionHref(s.id)}
            aria-label={list.stub(s.date, names(s.attendees), films)}
            className="flex min-h-touch items-center gap-lg text-ink no-underline"
          >
            <Avatars people={s.attendees} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <DateLabel>{s.date}</DateLabel>
              <span className="font-display text-step-title">
                {names(s.attendees)}
              </span>
            </span>
            <span className="shrink-0 text-meta text-ink-2 tabular-nums">
              {films}
            </span>
          </a>
        }
      >
        <NightRequest items={[...s.moods, ...s.constraints]} note={s.request} />
        <ReturnBox
          title={list.returnTitle}
          text={list.returnText}
          href={feedbackHref(s.id)}
          label={list.feedbackLabel(s.id)}
          action={list.feedback}
        />
      </Slip>
    </li>
  )
}

/** A closed Session: a row of the shelf, what they saw under the names. */
function ClosedRow({ session: s }: { session: SessionItem }) {
  return (
    <ShelfRow
      href={sessionHref(s.id)}
      before={<Avatars people={s.attendees} />}
    >
      <span className="font-display text-[15px] font-bold">
        {names(s.attendees)}
      </span>
      <Meta parts={[s.date, outcome(s), s.request, ...s.constraints]} />
    </ShelfRow>
  )
}

function Group({
  id,
  title,
  empty,
  sessions,
  Row,
}: {
  id: string
  title: string
  empty: string
  sessions: SessionItem[]
  Row: (props: { session: SessionItem }) => ReactNode
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-md">
      <GroupHeading id={id} title={title} count={sessions.length} />
      {sessions.length === 0 ? (
        <p className="text-ink-2">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-md">
          {sessions.map((s) => (
            <Row key={s.id} session={s} />
          ))}
        </ul>
      )}
    </section>
  )
}

/** `/sessoes`: the way to a new Session, then the open Sessions, then the
 * closed ones. `sessions` is null when the engine cannot run on this
 * server. */
export function SessionList({ sessions }: { sessions: SessionItem[] | null }) {
  const { list } = SESSIONS
  return (
    <ImportsFrame back={SESSIONS.back} backTo="/">
      <div className="flex flex-col gap-lg">
        <h1 className="font-display text-title">{list.title}</h1>
        <p className="max-w-[60ch] text-ink-2">{list.lead}</p>
        <NewSessionLink>{list.create}</NewSessionLink>
      </div>
      {sessions === null ? (
        <Alert>{SESSIONS.unavailable}</Alert>
      ) : (
        <>
          <Group
            id="abertas"
            title={list.open}
            empty={list.openEmpty}
            sessions={sessions.filter((s) => s.open)}
            Row={OpenRow}
          />
          <Group
            id="fechadas"
            title={list.closed}
            empty={list.closedEmpty}
            sessions={sessions.filter((s) => !s.open)}
            Row={ClosedRow}
          />
        </>
      )}
    </ImportsFrame>
  )
}

/** `/sessoes/<id>`: the Session and its Cartaz (Já vi, Trocar, stars,
 * comments, acrescentar; Enviar posts to `/sessoes/<id>/responder`). `page`
 * is `'unknown'` when there is no Session by that id, null when the engine
 * cannot run on this server; `notice` and `refusal` are what the form or
 * the last reply said. */
export function SessionScreen({
  page,
  notice,
  refusal,
}: {
  page: CartazPage | 'unknown' | null
  notice?: SessionNotice
  refusal?: ReplyRefusal
}) {
  return (
    <ImportsFrame back={SESSIONS.back} backTo="/sessoes">
      {page === null ? (
        <Alert>{SESSIONS.unavailable}</Alert>
      ) : page === 'unknown' ? (
        <Alert>{SESSIONS.session.unknown}</Alert>
      ) : (
        <SessionView page={page} notice={notice} refusal={refusal} />
      )}
    </ImportsFrame>
  )
}

const labels = (candidates: readonly { label: string }[]) =>
  candidates.map((c) => c.label)

/** The acrescentar, what went into the request from it, and what did
 * not. */
function readingText(addition: string, reading: PageReading): string {
  const { session } = SESSIONS
  return [
    session.additionRead(addition),
    reading.understood.length > 0 && session.additionAdded(reading.understood),
    reading.notUnderstood.length > 0 &&
      session.additionNotUnderstood(reading.notUnderstood),
    ...reading.ambiguities.map((a) =>
      session.additionAmbiguous(a.words, labels(a.candidates)),
    ),
    session.additionTaste,
  ]
    .filter(Boolean)
    .join(' ')
}

/** What the last reply or the form left to say: the warnings, and the
 * acrescentar, which is gosto only after the Dono's yes. */
function Said({ page }: { page: CartazPage }) {
  const { session } = SESSIONS
  return (
    <>
      {page.warnings.length > 0 && (
        <div
          role="status"
          className="flex flex-col gap-xs rounded-field border border-rule bg-surface-2 px-3 py-2.5"
        >
          <span className="font-semibold">{session.warnings}</span>
          <ul className="list-disc pl-5 text-meta">
            {page.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
      {page.addition && (
        <Notice>
          {page.reading
            ? readingText(page.addition, page.reading)
            : session.addition(page.addition)}{' '}
          <a href="/pessoas" className="font-semibold text-ink">
            {session.additionLink}
          </a>
        </Notice>
      )}
    </>
  )
}

function SessionView({
  page,
  notice,
  refusal,
}: {
  page: CartazPage
  notice?: SessionNotice
  refusal?: ReplyRefusal
}) {
  const { session } = SESSIONS
  const s = page.session
  return (
    <>
      <div className="flex flex-col gap-xs">
        <h1 className="font-display text-title">
          {session.title} {s.date}
        </h1>
        <Meta parts={[names(s.attendees), s.request]} />
      </div>
      {page.sessionLink && (
        <ShareSessionLink key={s.id} url={page.sessionLink} />
      )}
      {notice && <Notice>{session.notices[notice]}</Notice>}
      {refusal && <Alert>{session.refusals[refusal]}</Alert>}
      <Said page={page} />
      <PairwiseAnswers
        action={`${sessionHref(s.id)}/perguntas`}
        waiting={page.pairwise ?? []}
      />
      {page.billboard === null ? (
        <Alert>{SESSIONS.unavailable}</Alert>
      ) : (
        <Billboard
          billboard={page.billboard}
          action={`${sessionHref(s.id)}/responder`}
          sent={notice === 'regerada' || notice === 'anotada'}
        />
      )}
      {s.open ? (
        <LinkButton href={feedbackHref(s.id)}>
          {SESSIONS.list.feedback}
        </LinkButton>
      ) : (
        <Notice>
          {session.closed} · {outcome(s)}
        </Notice>
      )}
    </>
  )
}

// --- "Em uma frase" ------------------------------------------------------------
//
// The Dono's sentence, kept with the Session, and "Ler" (#199), which
// posts the form with `ler=sim` to come back with it filled from the
// sentence on top of what she had set. Under it, once read, what the
// sentence filled, what it left out and what it could not decide: a title
// of several films lists them, each with "Usar", as the Catálogo search.

/** What the reading of `reading` says, one line each; `pick` is the link
 * that takes a film for "Parecido com". */
function ReadingSaid({
  reading,
  pick,
}: {
  reading: PageReading
  pick: (id: string) => string
}) {
  const said = SESSIONS.form.reading
  // A title of several films lists them, with "Usar"; the rest is a line.
  const isFilms = (a: PageReading['ambiguities'][number]) =>
    a.field === 'similar' && a.candidates.length > 0
  const films = reading.ambiguities.filter(isFilms)
  const others = reading.ambiguities.filter((a) => !isFilms(a))
  const lines = [
    reading.understood.length > 0
      ? said.understood(reading.understood)
      : said.nothing,
    reading.notUnderstood.length > 0 &&
      said.notUnderstood(reading.notUnderstood),
    others.length > 0 &&
      said.ambiguous(
        others.map((a) => ({
          words: a.words,
          candidates: labels(a.candidates),
        })),
      ),
  ].filter((line) => line !== false)
  return (
    <>
      <Notice>
        {lines.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </Notice>
      {films.map((a) => (
        <div key={a.words} className="flex flex-col gap-xs">
          <p className="text-meta">{said.similarAmbiguous(a.words)}</p>
          <ul className="flex flex-col">
            {a.candidates.map((film) => (
              <Item
                key={film.id}
                actions={
                  <LinkButton
                    href={pick(film.id)}
                    label={CATALOG_SEARCH.pickLabel(film.label)}
                  >
                    {CATALOG_SEARCH.pick}
                  </LinkButton>
                }
              >
                <span className="font-semibold">{film.label}</span>
              </Item>
            ))}
          </ul>
        </div>
      ))}
    </>
  )
}

function Sentence({
  text,
  reading,
  pick,
}: {
  text?: string
  reading: PageReading | null
  pick: (id: string) => string
}) {
  const { form } = SESSIONS
  return (
    <div className="flex flex-col gap-lg rounded-card border border-rule bg-surface p-xl">
      <div className="flex flex-col gap-sm sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <TextField
            name="pedido"
            label={form.words}
            hint={form.wordsHint}
            placeholder={form.wordsPlaceholder}
            defaultValue={text}
          />
        </div>
        <Submit name="ler" value="sim" className="self-start sm:self-auto">
          {form.read}
        </Submit>
      </div>
      {reading && <ReadingSaid reading={reading} pick={pick} />}
    </div>
  )
}

// --- the Nova Sessão form ------------------------------------------------------

const grid = 'grid grid-cols-1 gap-lg sm:grid-cols-2'
const pills = 'flex flex-wrap gap-sm'

const CHILD_OPTIONS = [
  { value: '', label: SESSIONS.form.childNone },
  { value: '0', label: SESSIONS.form.childNoAge },
  ...Array.from({ length: MAX_CHILD_AGE }, (_, i) => ({
    value: String(i + 1),
    label: SESSIONS.form.childAge(i + 1),
  })),
]

/** The form's fields as "Ler" left them; none before a reading. */
type Asked = Partial<SessionRequestForm>

/** The form's value of the Regra asked for. */
const ruleChoice = (rule: Asked['rule']) =>
  (Object.keys(RULE_CHOICES) as (keyof typeof RULE_CHOICES)[]).find(
    (choice) => RULE_CHOICES[choice] === (rule ?? 'default'),
  )

/** A number field's value as the input holds it. */
const inputValue = (value: number | string | undefined) =>
  value === undefined ? undefined : String(value)

/** Nova Sessão with the search of `query` and the draft of `note`: "Usar"
 * adds a film to the ones "Parecido com" already has (`similar`). */
const similarHref =
  (
    similar: string | undefined,
    query: string | undefined,
    note: string | undefined,
  ) =>
  (id: string) => {
    const params = new URLSearchParams({
      parecido: similarParam(`${similar ?? ''},${id}`) ?? id,
    })
    if (query !== undefined) params.set('buscar', query)
    if (note !== undefined) params.set('nota', note)
    return `/sessoes/nova?${params.toString()}`
  }

/** `/sessoes/nova`: the form that opens a Session (`recommendSession`). A
 * plain POST to `/sessoes/nova/enviar`: it works before the JavaScript.
 * `options` is null when the engine cannot run on this server. Above it,
 * folded until it is needed, the Catálogo search (`search`) fills
 * "Parecido com" (`similar`). `draft` is the form "Ler" filled, kept in the
 * note `note`: the form comes back with it. */
export function NewSession({
  options,
  refusal,
  search = null,
  similar,
  draft = null,
  note,
}: {
  options: RequestOptions | null
  refusal?: SessionRequestRefusal
  search?: SearchAnswer | null
  similar?: string
  draft?: NewSessionDraft | null
  note?: string
}) {
  const { form } = SESSIONS
  // The films of the draft, then the ones "Usar" took since.
  const films = similarParam(
    [...(draft?.fields.similar ?? []), similar ?? ''].join(','),
  )
  const pick = similarHref(films, search?.query, note)
  return (
    <ImportsFrame back={SESSIONS.back} backTo="/sessoes">
      <div className="flex flex-col gap-sm">
        <h1 className="font-display text-title">{form.title}</h1>
        <p className="max-w-[60ch] text-ink-2">{form.lead}</p>
      </div>
      {refusal && <Alert>{SESSIONS.refusals[refusal]}</Alert>}
      {options === null ? (
        <Alert>{SESSIONS.unavailable}</Alert>
      ) : (
        <>
          <SearchFold
            summary={form.searchFold}
            hint={form.searchFoldHint}
            open={search !== null || similar !== undefined}
          >
            <CatalogSearch
              action="/sessoes/nova"
              scope="films"
              answer={search}
              keep={{ parecido: films, nota: note }}
              pick={pick}
            />
          </SearchFold>
          <NewSessionForm
            key={`${note ?? ''} ${films ?? ''}`}
            options={options}
            similar={films}
            draft={draft}
            pick={pick}
          />
        </>
      )}
    </ImportsFrame>
  )
}

function NewSessionForm({
  options,
  similar,
  draft,
  pick,
}: {
  options: RequestOptions
  similar?: string
  draft: NewSessionDraft | null
  pick: (id: string) => string
}) {
  const { form } = SESSIONS
  const asked = draft?.fields ?? {}
  return (
    <form
      method="post"
      action="/sessoes/nova/enviar"
      aria-label={form.label}
      className="flex flex-col gap-3xl"
    >
      {/* Enter in any field sends the form, as before "Ler" came above:
          the first submit button is the one Enter presses. */}
      <button type="submit" hidden>
        {form.submit}
      </button>
      <Sentence
        text={asked.request}
        reading={draft?.reading ?? null}
        pick={pick}
      />
      <Attendees options={options} asked={asked} />
      <Rule options={options} asked={asked} />
      <Moods moods={options.moods} asked={asked} />
      <Constraints similar={similar} asked={asked} />
      <SeriesOrder />
      <Submit variant="primary" className="w-full sm:w-auto sm:self-start">
        {form.submit}
      </Submit>
    </form>
  )
}

function Attendees({
  options,
  asked,
}: {
  options: RequestOptions
  asked: Asked
}) {
  const { form } = SESSIONS
  const attending = asked.attendees && new Set(asked.attendees)
  return (
    <Section id="presentes" title={form.attendees} lead={form.attendeesLead}>
      <div className={pills}>
        {options.people.map((p) => (
          <Option
            key={p.person}
            name="presentes"
            value={p.person}
            defaultChecked={attending ? attending.has(p.person) : p.owner}
          >
            <span className="flex items-center gap-sm">
              {p.name}
              {p.owner && <OwnerTag />}
            </span>
          </Option>
        ))}
      </div>
      <div className={grid}>
        <TextField
          name="quantos"
          type="number"
          min={1}
          max={50}
          label={form.count}
          hint={form.countHint}
          defaultValue={inputValue(asked.count)}
        />
      </div>
    </Section>
  )
}

function Rule({ options, asked }: { options: RequestOptions; asked: Asked }) {
  const { form } = SESSIONS
  const chosen = ruleChoice(asked.rule)
  return (
    <Section id="regra" title={form.rule}>
      <div className="flex flex-col gap-sm" role="radiogroup">
        {Object.keys(RULE_CHOICES).map((value) => (
          <Option
            key={value}
            type="radio"
            shape="row"
            name="regra"
            value={value}
            defaultChecked={value === chosen}
          >
            {form.rules[value as keyof typeof RULE_CHOICES]}
          </Option>
        ))}
      </div>
      <SelectField
        name="de"
        label={form.by}
        hint={form.byHint}
        options={[
          { value: '', label: form.byNone },
          ...options.people.map((p) => ({ value: p.person, label: p.name })),
        ]}
        defaultValue={asked.by ?? ''}
      />
    </Section>
  )
}

/** The Série na ordem (#165): three modes, the default checked and
 * marked. */
function SeriesOrder() {
  const { form } = SESSIONS
  return (
    <Section id="serie" title={form.seriesOrder} lead={form.seriesOrderLead}>
      <div className="flex flex-col gap-sm" role="radiogroup">
        {(Object.keys(SERIES_ORDER_CHOICES) as SeriesOrderChoice[]).map(
          (value) => (
            <Option
              key={value}
              type="radio"
              shape="row"
              name="serie"
              value={value}
              defaultChecked={value === DEFAULT_SERIES_ORDER_CHOICE}
            >
              {form.seriesOrders[value]}
              {value === DEFAULT_SERIES_ORDER_CHOICE && (
                <span className="font-body text-meta font-normal text-ink-2">
                  {' · '}
                  {form.seriesOrderDefault}
                </span>
              )}
            </Option>
          ),
        )}
      </div>
    </Section>
  )
}

function Moods({ moods, asked }: { moods: readonly string[]; asked: Asked }) {
  const { form } = SESSIONS
  const chosen = new Set(asked.moods)
  return (
    <Section id="climas" title={form.moods} lead={form.moodsLead}>
      <div className={pills}>
        {moods.map((mood) => (
          <Option
            key={mood}
            name="climas"
            value={mood}
            defaultChecked={chosen.has(mood)}
          >
            {mood}
          </Option>
        ))}
      </div>
    </Section>
  )
}

function Constraints({ similar, asked }: { similar?: string; asked: Asked }) {
  const { form } = SESSIONS
  const year = { type: 'number', min: 1870, max: 2100 } as const
  return (
    <Section
      id="restricoes"
      title={form.constraints}
      lead={form.constraintsLead}
    >
      <div className="flex flex-col gap-sm">
        <Option name="sem-ja-visto" shape="row" defaultChecked={asked.unseen}>
          {form.unseen}{' '}
          <span className="font-body text-meta font-normal text-ink-2">
            {form.unseenHint}
          </span>
        </Option>
        <div className={pills}>
          <Option name="sem-lento" defaultChecked={asked.noSlow}>
            {form.noSlow}
          </Option>
          <Option name="sem-tristeza" defaultChecked={asked.noSad}>
            {form.noSad}
          </Option>
        </div>
      </div>
      <div className={grid}>
        <TextField
          name="duracao"
          type="number"
          min={1}
          label={form.duration}
          hint={form.durationHint}
          defaultValue={inputValue(asked.maxDuration)}
        />
        <SelectField
          name="crianca"
          label={form.child}
          options={CHILD_OPTIONS}
          defaultValue={inputValue(asked.child) ?? ''}
        />
        <TextField
          name="desde"
          {...year}
          label={form.since}
          hint={form.yearHint}
          defaultValue={inputValue(asked.since)}
        />
        <TextField
          name="ate"
          {...year}
          label={form.until}
          hint={form.yearHint}
          defaultValue={inputValue(asked.until)}
        />
      </div>
      <TextField
        name="idioma"
        label={form.language}
        hint={form.languageHint}
        defaultValue={asked.language}
      />
      <TextField
        name="gatilhos"
        label={form.triggers}
        hint={form.triggersHint}
        defaultValue={asked.triggers?.join(', ')}
      />
      <TextField
        name="parecido"
        label={form.similar}
        hint={form.similarHint}
        placeholder="tt…"
        defaultValue={similar}
      />
    </Section>
  )
}
