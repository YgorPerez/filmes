import type { ReactNode } from 'react'
import {
  MAX_CHILD_AGE,
  RULE_CHOICES,
  type SessionRequestRefusal,
} from '#/content/session-request'
import type { ReplyRefusal, SessionNotice } from '#/content/billboard-reply'
import type { CartazPage } from '#/platform/billboard'
import type { SearchAnswer } from '#/platform/catalog-search'
import type {
  RequestOptions,
  SessionItem,
  SessionPerson,
} from '#/platform/sessions'
import { Billboard } from './billboard'
import { ImportsFrame } from './imports'
import {
  Alert,
  CatalogSearch,
  LinkButton,
  Meta,
  Notice,
  OwnerTag,
  Section,
  SelectField,
  Submit,
  TextField,
} from './person-parts'
import { SESSIONS } from './sessions.copy'

const names = (attendees: readonly SessionPerson[]) =>
  attendees.map((a) => a.name).join(', ')

const sessionHref = (id: string) => `/sessoes/${encodeURIComponent(id)}`
const feedbackHref = (id: string) => `/feedback/${encodeURIComponent(id)}`

/** What a closed Session ended with: the chosen film or nothing. */
const outcome = (s: SessionItem) =>
  s.chosen ? SESSIONS.list.chosen(s.chosen.title) : SESSIONS.list.nothing

/** A Session in the list: a link to its page, and, while open, to its
 * Feedback (#115's form, outside `/sessoes`). */
function Row({ session: s }: { session: SessionItem }) {
  const { list } = SESSIONS
  return (
    <li className="flex flex-wrap items-center gap-sm border-rule px-md py-sm not-first:border-t">
      <a
        href={sessionHref(s.id)}
        className="flex min-h-touch min-w-0 flex-1 basis-[240px] flex-col justify-center gap-0.5 text-ink no-underline"
      >
        <span className="font-semibold">
          {s.date} · {names(s.attendees)}
        </span>
        <Meta
          parts={[
            s.request,
            s.open ? SESSIONS.films(s.recommendation.length) : outcome(s),
            ...s.constraints,
          ]}
        />
      </a>
      {s.open && (
        <LinkButton href={feedbackHref(s.id)} label={list.feedbackLabel(s.id)}>
          {list.feedback}
        </LinkButton>
      )}
    </li>
  )
}

function Group({
  id,
  title,
  empty,
  sessions,
}: {
  id: string
  title: string
  empty: string
  sessions: SessionItem[]
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-sm">
      <h2 id={id} className="text-title">
        {title}
      </h2>
      {sessions.length === 0 ? (
        <p className="text-ink-2">{empty}</p>
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-card border border-rule bg-surface">
          {sessions.map((s) => (
            <Row key={s.id} session={s} />
          ))}
        </ul>
      )}
    </section>
  )
}

/** `/sessoes`: the open Sessions, then the closed ones, and the way to a
 * new one. `sessions` is null when the engine cannot run on this server. */
export function SessionList({ sessions }: { sessions: SessionItem[] | null }) {
  const { list } = SESSIONS
  return (
    <ImportsFrame back={SESSIONS.back} backTo="/">
      <div className="flex flex-col gap-sm">
        <h1 className="text-title">{list.title}</h1>
        <p className="text-ink-2">{list.lead}</p>
      </div>
      <LinkButton href="/sessoes/nova" variant="primary">
        {list.create}
      </LinkButton>
      {sessions === null ? (
        <Alert>{SESSIONS.unavailable}</Alert>
      ) : (
        <>
          <Group
            id="abertas"
            title={list.open}
            empty={list.openEmpty}
            sessions={sessions.filter((s) => s.open)}
          />
          <Group
            id="fechadas"
            title={list.closed}
            empty={list.closedEmpty}
            sessions={sessions.filter((s) => !s.open)}
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
          {session.addition(page.addition)}{' '}
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
        <h1 className="text-title">
          {session.title} {s.date}
        </h1>
        <Meta parts={[names(s.attendees), s.request]} />
      </div>
      {notice && <Notice>{session.notices[notice]}</Notice>}
      {refusal && <Alert>{session.refusals[refusal]}</Alert>}
      <Said page={page} />
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

// --- the Nova Sessão form ------------------------------------------------------

const choice =
  'flex min-h-touch cursor-pointer items-center gap-sm rounded-field border border-rule px-3 py-2 has-checked:border-ink has-checked:bg-surface-2'

/** A checkbox or a radio, as a whole row to tap. */
function Choice({
  type = 'checkbox',
  name,
  value = 'sim',
  defaultChecked,
  children,
}: {
  type?: 'checkbox' | 'radio'
  name: string
  value?: string
  defaultChecked?: boolean
  children: ReactNode
}) {
  const input = { name, value, defaultChecked }
  return (
    <label className={choice}>
      {type === 'radio' ? (
        <input type="radio" {...input} />
      ) : (
        <input type="checkbox" {...input} />
      )}
      <span>{children}</span>
    </label>
  )
}

const grid = 'grid grid-cols-1 gap-sm sm:grid-cols-2'

const CHILD_OPTIONS = [
  { value: '', label: SESSIONS.form.childNone },
  { value: '0', label: SESSIONS.form.childNoAge },
  ...Array.from({ length: MAX_CHILD_AGE }, (_, i) => ({
    value: String(i + 1),
    label: SESSIONS.form.childAge(i + 1),
  })),
]

/** Nova Sessão with `similar` and the search of `query`: "Usar" adds a
 * film to "Parecido com". */
const similarHref =
  (similar: string | undefined, query: string | undefined) => (id: string) => {
    const ids = [...new Set([...(similar?.split(',') ?? []), id])]
    const params = new URLSearchParams({ parecido: ids.join(',') })
    if (query !== undefined) params.set('buscar', query)
    return `/sessoes/nova?${params.toString()}`
  }

/** `/sessoes/nova`: the form that opens a Session (`recommendSession`). A
 * plain POST to `/sessoes/nova/enviar`: it works before the JavaScript.
 * `options` is null when the engine cannot run on this server. Above it,
 * the Catálogo search (`search`) fills "Parecido com" (`similar`). */
export function NewSession({
  options,
  refusal,
  search = null,
  similar,
}: {
  options: RequestOptions | null
  refusal?: SessionRequestRefusal
  search?: SearchAnswer | null
  similar?: string
}) {
  const { form } = SESSIONS
  return (
    <ImportsFrame back={SESSIONS.back} backTo="/sessoes">
      <div className="flex flex-col gap-sm">
        <h1 className="text-title">{form.title}</h1>
        <p className="text-ink-2">{form.lead}</p>
      </div>
      {refusal && <Alert>{SESSIONS.refusals[refusal]}</Alert>}
      {options === null ? (
        <Alert>{SESSIONS.unavailable}</Alert>
      ) : (
        <>
          <CatalogSearch
            action="/sessoes/nova"
            scope="films"
            answer={search}
            keep={{ parecido: similar }}
            pick={similarHref(similar, search?.query)}
          />
          <NewSessionForm options={options} similar={similar} />
        </>
      )}
    </ImportsFrame>
  )
}

function NewSessionForm({
  options,
  similar,
}: {
  options: RequestOptions
  similar?: string
}) {
  const { form } = SESSIONS
  return (
    <form
      method="post"
      action="/sessoes/nova/enviar"
      aria-label={form.label}
      className="flex flex-col gap-xl"
    >
      <Attendees options={options} />
      <Rule options={options} />
      <Moods moods={options.moods} />
      <Constraints similar={similar} />
      <Submit variant="primary">{form.submit}</Submit>
    </form>
  )
}

function Attendees({ options }: { options: RequestOptions }) {
  const { form } = SESSIONS
  return (
    <Section id="presentes" title={form.attendees} lead={form.attendeesLead}>
      <div className={grid}>
        {options.people.map((p) => (
          <Choice
            key={p.person}
            name="presentes"
            value={p.person}
            defaultChecked={p.owner}
          >
            <span className="flex items-center gap-sm">
              {p.name}
              {p.owner && <OwnerTag />}
            </span>
          </Choice>
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
        />
        <TextField
          name="pedido"
          label={form.words}
          hint={form.wordsHint}
          placeholder={form.wordsPlaceholder}
        />
      </div>
    </Section>
  )
}

function Rule({ options }: { options: RequestOptions }) {
  const { form } = SESSIONS
  return (
    <Section id="regra" title={form.rule}>
      <div className="flex flex-col gap-sm" role="radiogroup">
        {Object.keys(RULE_CHOICES).map((value) => (
          <Choice
            key={value}
            type="radio"
            name="regra"
            value={value}
            defaultChecked={value === 'padrao'}
          >
            {form.rules[value as keyof typeof RULE_CHOICES]}
          </Choice>
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
        defaultValue=""
      />
    </Section>
  )
}

function Moods({ moods }: { moods: readonly string[] }) {
  const { form } = SESSIONS
  return (
    <Section id="climas" title={form.moods} lead={form.moodsLead}>
      <div className={grid}>
        {moods.map((mood) => (
          <Choice key={mood} name="climas" value={mood}>
            {mood}
          </Choice>
        ))}
      </div>
    </Section>
  )
}

function Constraints({ similar }: { similar?: string }) {
  const { form } = SESSIONS
  const year = { type: 'number', min: 1870, max: 2100 } as const
  return (
    <Section
      id="restricoes"
      title={form.constraints}
      lead={form.constraintsLead}
    >
      <div className={grid}>
        <TextField
          name="duracao"
          type="number"
          min={1}
          label={form.duration}
          hint={form.durationHint}
        />
        <SelectField
          name="crianca"
          label={form.child}
          options={CHILD_OPTIONS}
          defaultValue=""
        />
        <TextField
          name="desde"
          {...year}
          label={form.since}
          hint={form.yearHint}
        />
        <TextField
          name="ate"
          {...year}
          label={form.until}
          hint={form.yearHint}
        />
      </div>
      <TextField name="idioma" label={form.language} hint={form.languageHint} />
      <TextField
        name="gatilhos"
        label={form.triggers}
        hint={form.triggersHint}
      />
      <TextField
        name="parecido"
        label={form.similar}
        hint={form.similarHint}
        placeholder="tt…"
        defaultValue={similar}
      />
      <div className="flex flex-col gap-sm">
        <Choice name="sem-ja-visto">
          {form.unseen}{' '}
          <span className="text-meta text-ink-2">{form.unseenHint}</span>
        </Choice>
        <Choice name="sem-lento">{form.noSlow}</Choice>
        <Choice name="sem-tristeza">{form.noSad}</Choice>
      </div>
    </Section>
  )
}
