import { useCallback, useState, type FormEvent } from 'react'
import {
  DEFAULT_SERIES_ORDER_CHOICE,
  isSessionRequestRefusal,
  MAX_CHILD_AGE,
  RULE_CHOICES,
  SERIES_ORDER_CHOICES,
  type SessionRequestForm,
  type SessionRequestRefusal,
} from '#/content/session-request'
import { similarParam } from '#/content/catalog-search'
import type { SearchAnswer } from '#/platform/catalog-search'
import type { PageReading } from '#/platform/reading'
import type { NewSessionDraft, RequestOptions } from '#/platform/sessions'
import { ImportsFrame } from './imports'
import { useFetchForm, useHydrated } from './kit/fetch-form'
import { refusalOn, useRefusalInPlace } from './kit/refusal-in-place'
import { Option } from './kit/option'
import { OwnerTag } from './kit/owner-tag'
import {
  Alert,
  PostFailed,
  ChosenFilms,
  Disclosure,
  Item,
  Notice,
  PickFilm,
  SessionFilmLookup,
  type ChosenFilm,
  Section,
  SelectField,
  Submit,
  TextField,
} from './person-parts'
import { SESSIONS, spoken } from './sessions.copy'

// --- "Em uma frase" ------------------------------------------------------------
//
// The Dono's sentence, kept with the Session, and "Ler" (#199), which
// posts the form with `ler=sim` to come back with it filled from the
// sentence on top of what she had set. Under it, once read, what the
// sentence filled, what it left out and what it could not decide: a title
// of several films lists them, each with "Usar", as the Catálogo search.

/** What the reading of `reading` says, one line each; `pick` is the link
 * that takes a film for "Parecido com". */
const labels = (candidates: readonly { label: string }[]) =>
  candidates.map((candidate) => candidate.label)

type Ambiguity = PageReading['ambiguities'][number]

/** The reading's doubts by how they show: a title of several films lists
 * them, with "Usar"; a title the Catálogo does not have, the search with
 * the words in it; the rest is a line. */
function sortAmbiguities(ambiguities: readonly Ambiguity[]) {
  const films: Ambiguity[] = []
  const missing: Ambiguity[] = []
  const others: Ambiguity[] = []
  for (const a of ambiguities) {
    if (a.field !== 'similar') others.push(a)
    else if (a.candidates.length > 0) films.push(a)
    else missing.push(a)
  }
  return { films, missing, others }
}

function ReadingSaid({
  reading,
  pick,
  onPick,
  owner,
}: {
  reading: PageReading
  pick: (id: string) => string
  onPick?: (film: ChosenFilm & { label: string }) => void
  /** The logged-in Dono's name: she is "você" in the sentence. */
  owner?: string
}) {
  const said = SESSIONS.form.reading
  const { films, missing, others } = sortAmbiguities(reading.ambiguities)
  const lines = [
    reading.understood.length > 0
      ? said.understood(reading.understood.map((label) => spoken(label, owner)))
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
      {missing.map((a) => (
        <p key={a.words} className="text-meta">
          {said.missing(a.words)}{' '}
          <a
            href={`/sessoes/nova?${new URLSearchParams({ buscar: a.words }).toString()}`}
            className="font-semibold text-ink"
          >
            {said.missingSearch}
          </a>
        </p>
      ))}
      {films.map((a) => (
        <div key={a.words} className="flex flex-col gap-xs">
          <p className="text-meta">{said.similarAmbiguous(a.words)}</p>
          <ul className="flex flex-col">
            {a.candidates.map((film) => (
              <Item
                key={film.id}
                actions={
                  <PickFilm
                    id={film.id}
                    label={film.label}
                    pick={pick}
                    onPick={onPick}
                  />
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
  onPick,
  busy,
  owner,
}: {
  text?: string
  reading: PageReading | null
  pick: (id: string) => string
  onPick?: (film: ChosenFilm & { label: string }) => void
  busy: string | null
  owner?: string
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
        <Submit
          name="ler"
          value="sim"
          disabled={busy !== null}
          className="self-start sm:self-auto"
        >
          {busy === 'ler' ? form.reading.busy : form.read}
        </Submit>
      </div>
      {reading && (
        <ReadingSaid
          reading={reading}
          pick={pick}
          onPick={onPick}
          owner={owner}
        />
      )}
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

/** The refusals about a field under "Mais opções", which opens to show
 * it. */
const DETAILS_REFUSALS: ReadonlySet<SessionRequestRefusal> =
  new Set<SessionRequestRefusal>(['de', 'quantos', 'anos', 'crianca', 'pedido'])

/** Whether the draft set a field under "Mais opções": then it comes
 * open, so what "Ler" or the Dono filled stays in sight. */
const detailsAsked = (asked: Asked) =>
  [
    asked.count,
    asked.since,
    asked.until,
    asked.language,
    asked.child,
    asked.by,
  ].some((value) => value !== undefined) ||
  Boolean(asked.unseen || asked.noSlow || asked.noSad) ||
  (asked.noMoods?.length ?? 0) > 0 ||
  (asked.triggers?.length ?? 0) > 0 ||
  (asked.rule !== undefined && asked.rule !== 'default') ||
  (asked.seriesOrder !== undefined &&
    asked.seriesOrder !== SERIES_ORDER_CHOICES[DEFAULT_SERIES_ORDER_CHOICE])

/** A text field's value; a file (none here) is no text. */
const fieldText = (data: FormData, name: string): string => {
  const value = data.get(name)
  return typeof value === 'string' ? value : ''
}

/** The words of a list field ("assustador, tenso"). */
const listed = (data: FormData, name: string) =>
  fieldText(data, name)
    .split(',')
    .map((word) => word.trim())
    .filter((word) => word !== '')

/** The Restrições the form asks for so far, as the Cartaz's label says
 * them, and the rest counted (#272). */
function limitsOf(data: FormData): string[] {
  const { night } = SESSIONS.form
  const filled = (name: string) => fieldText(data, name).trim() !== ''
  const noMoods = listed(data, 'sem-climas')
  const child = fieldText(data, 'crianca')
  const more = [
    filled('desde') || filled('ate'),
    filled('idioma'),
    listed(data, 'gatilhos').length > 0,
  ].filter(Boolean).length
  return [
    noMoods.length > 0 ? night.noMoods(noMoods) : null,
    data.has('sem-lento') ? night.noSlow : null,
    data.has('sem-tristeza') ? night.noSad : null,
    data.has('sem-ja-visto') ? night.unseen : null,
    child === '' ? null : night.child(child),
    more > 0 ? night.more(more) : null,
  ].filter((item): item is string => item !== null)
}

/** The night the form asks for so far, as the shelf label would say it:
 * who ("você", "vocês dois"), the duration, the Climas and the
 * Restrições. */
function nightOf(data: FormData, options: RequestOptions): string[] {
  const people = data.getAll('presentes').map(String)
  const one = options.people.find((p) => p.person === people[0])
  const who =
    people.length === 0
      ? null
      : people.length === 1
        ? one?.owner
          ? SESSIONS.form.alone
          : (one?.name ?? null)
        : SESSIONS.form.together(people.length)
  const minutes = Number(data.get('duracao'))
  const hours = Math.floor(minutes / 60)
  const duration =
    minutes > 0
      ? `até ${hours > 0 ? `${hours}h${minutes % 60 ? String(minutes % 60).padStart(2, '0') : ''}` : `${minutes}min`}`
      : null
  return [
    who,
    duration,
    ...data.getAll('climas').map(String),
    ...limitsOf(data),
  ].filter((item): item is string => item !== null)
}

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
  attendees,
}: {
  options: RequestOptions | null
  refusal?: SessionRequestRefusal
  search?: SearchAnswer | null
  similar?: string
  draft?: NewSessionDraft | null
  note?: string
  /** The Presentes to start with: "Pedir filme de novo com essa turma"
   * (#272). */
  attendees?: readonly string[]
}) {
  const { form } = SESSIONS
  // The films of the draft, then the ones "Usar" took since.
  const films = similarParam(
    [...(draft?.fields.similar ?? []), similar ?? ''].join(','),
  )
  const pick = similarHref(films, search?.query, note)
  return (
    <ImportsFrame back={SESSIONS.back} backTo="/sessoes">
      <h1 className="font-display text-counter-title">{form.title}</h1>
      {options === null ? (
        <Alert>{SESSIONS.unavailable}</Alert>
      ) : (
        <NewSessionForm
          key={`${note ?? ''} ${films ?? ''}`}
          options={options}
          similar={films}
          draft={draft}
          pick={pick}
          search={search}
          note={note}
          refusal={refusal}
          attendees={attendees}
        />
      )}
    </ImportsFrame>
  )
}

/** The form's fields to start with: the draft's, or the Presentes asked
 * for. */
const startingFields = (
  draft: NewSessionDraft | null,
  attendees: readonly string[] | undefined,
): Asked => draft?.fields ?? (attendees ? { attendees: [...attendees] } : {})

/** The night the form asks for so far, kept as the Dono changes it: on
 * the bar by Recomendar (#272). */
function useNight(options: RequestOptions) {
  const [night, setNight] = useState<string[] | null>(null)
  const listen = (event: FormEvent<HTMLFormElement>) =>
    setNight(nightOf(new FormData(event.currentTarget), options))
  // What the form starts with, once it is in the page.
  const start = useCallback(
    (form: HTMLFormElement | null) => {
      if (form) setNight(nightOf(new FormData(form), options))
    },
    [options],
  )
  return { night, listen, start }
}

function NewSessionForm({
  options,
  similar,
  draft,
  pick,
  search,
  note,
  refusal,
  attendees,
}: {
  options: RequestOptions
  similar?: string
  draft: NewSessionDraft | null
  pick: (id: string) => string
  search: SearchAnswer | null
  note?: string
  refusal?: SessionRequestRefusal
  attendees?: readonly string[]
}) {
  const { form } = SESSIONS
  const asked = startingFields(draft, attendees)
  const live = useHydrated()
  const { refused, alert, onAnswer } = useRefusalInPlace(
    refusal,
    refusalOn(isSessionRequestRefusal, '/sessoes/nova'),
  )
  const { onSubmit, busy, failed } = useFetchForm(onAnswer)
  const films = useChosenFilms(similar)
  const { night, listen, start } = useNight(options)
  return (
    <form
      ref={start}
      method="post"
      action="/sessoes/nova/enviar"
      aria-label={form.label}
      onSubmit={onSubmit}
      onChange={listen}
      className="flex flex-col gap-3xl"
    >
      {/* Enter in any field sends the form, as before "Ler" came above:
          the first submit button is the one Enter presses. With a search
          not run yet in its field, the server searches instead
          (`searchAsked`). */}
      <button type="submit" name="tecla" value="enter" hidden>
        {form.submit}
      </button>
      {note && <input type="hidden" name="nota" value={note} />}
      {refused && (
        <div ref={alert}>
          <Alert>{SESSIONS.refusals[refused]}</Alert>
        </div>
      )}
      <PostFailed failed={failed} />
      <Sentence
        text={asked.request}
        reading={draft?.reading ?? null}
        pick={pick}
        onPick={live ? films.take : undefined}
        busy={busy}
        owner={options.people.find((p) => p.owner)?.name}
      />
      <Attendees options={options} asked={asked} />
      <Moods moods={options.moods} asked={asked} />
      <Section id="duracao" title={form.time}>
        <div className={grid}>
          <TextField
            name="duracao"
            type="number"
            min={1}
            label={form.duration}
            hint={form.durationHint}
            defaultValue={inputValue(asked.maxDuration)}
          />
        </div>
      </Section>
      <div className="flex flex-col gap-sm">
        <Similar
          open={
            search !== null ||
            similar !== undefined ||
            refused === 'parecido' ||
            films.chosen.length > 0
          }
          search={search}
          similar={similar}
          pick={pick}
          films={live ? films : null}
        />
        <Details options={options} asked={asked} refused={refused} />
      </div>
      <RecommendBar night={night} busy={busy} />
    </form>
  )
}

/** "Mais opções": the Restrições, the Regra and the Série na ordem, open
 * when the draft set one or a refusal is about one. */
function Details({
  options,
  asked,
  refused,
}: {
  options: RequestOptions
  asked: Asked
  refused: SessionRequestRefusal | undefined
}) {
  return (
    <Disclosure
      summary={SESSIONS.form.details}
      open={
        detailsAsked(asked) ||
        (refused !== undefined && DETAILS_REFUSALS.has(refused))
      }
    >
      <div className="flex flex-col gap-3xl">
        <Constraints asked={asked} moods={options.moods} />
        <Rule options={options} asked={asked} />
        <SeriesOrder asked={asked} />
      </div>
    </Disclosure>
  )
}

/** Recomendar stays a thumb away, above the tabs, with the night so far
 * (#272). */
function RecommendBar({
  night,
  busy,
}: {
  night: readonly string[] | null
  busy: string | null
}) {
  const { form } = SESSIONS
  return (
    <div className="sticky bottom-[calc(68px+env(safe-area-inset-bottom))] z-10 flex items-center justify-between gap-md rounded-t-panel border-x border-t border-rule bg-surface px-lg py-sm min-[900px]:bottom-0">
      <p className="min-w-0 font-display text-label text-ink-2 uppercase">
        {night?.join(' · ')}
      </p>
      <Submit variant="primary" disabled={busy !== null} className="shrink-0">
        {busy !== null && busy !== 'ler' ? form.submitting : form.submit}
      </Submit>
    </div>
  )
}

/** The films "Parecido com" took, from the ids the page came with. */
function useChosenFilms(similar: string | undefined) {
  const [chosen, setChosen] = useState<readonly ChosenFilm[]>(() =>
    (similar ?? '')
      .split(',')
      .filter((id) => id !== '')
      .map((id) => ({ id })),
  )
  const take = (film: ChosenFilm) =>
    setChosen((films) =>
      films.some((f) => f.id === film.id) ? films : [...films, film],
    )
  const drop = (id: string) =>
    setChosen((films) => films.filter((f) => f.id !== id))
  const name = useCallback(
    (id: string, label: string) =>
      setChosen((films) => films.map((f) => (f.id === id ? { id, label } : f))),
    [],
  )
  return { chosen, take, drop, name }
}

/** "Parecido com um filme?": the Catálogo search, then the films taken.
 * `films` is null before the JavaScript: a field of ids, and "Usar" a
 * link (`pick`). */
function Similar({
  open,
  search,
  similar,
  pick,
  films,
}: {
  open: boolean
  search: SearchAnswer | null
  similar?: string
  pick: (id: string) => string
  films: ReturnType<typeof useChosenFilms> | null
}) {
  const { form } = SESSIONS
  return (
    <Disclosure summary={form.searchFold} open={open}>
      <div className="flex flex-col gap-xl">
        <SessionFilmLookup
          name="buscar"
          label={form.searchLabel}
          answer={search}
          pick={pick}
          onPick={films?.take}
        />
        {films ? (
          <ChosenFilms
            name="parecido"
            label={form.similar}
            empty={form.similarNone}
            films={films.chosen}
            onRemove={films.drop}
            onLabel={films.name}
          />
        ) : (
          <TextField
            name="parecido"
            label={form.similar}
            hint={form.similarHint}
            defaultValue={similar}
          />
        )}
      </div>
    </Disclosure>
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
    <Section id="presentes" title={form.attendees}>
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
    </Section>
  )
}

function Rule({ options, asked }: { options: RequestOptions; asked: Asked }) {
  const { form } = SESSIONS
  const chosen = ruleChoice(asked.rule)
  return (
    <Section id="regra" title={form.rule} plain>
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
function SeriesOrder({ asked }: { asked: Asked }) {
  const { form } = SESSIONS
  return (
    <Section
      id="serie"
      title={form.seriesOrder}
      lead={form.seriesOrderLead}
      plain
    >
      <div className="flex flex-col gap-sm" role="radiogroup">
        {(
          Object.keys(
            SERIES_ORDER_CHOICES,
          ) as (keyof typeof SERIES_ORDER_CHOICES)[]
        ).map((value) => (
          <Option
            key={value}
            type="radio"
            shape="row"
            name="serie"
            value={value}
            defaultChecked={
              asked.seriesOrder
                ? asked.seriesOrder === SERIES_ORDER_CHOICES[value]
                : value === DEFAULT_SERIES_ORDER_CHOICE
            }
          >
            {form.seriesOrders[value]}
            {value === DEFAULT_SERIES_ORDER_CHOICE && (
              <span className="font-body text-meta font-normal text-ink-2">
                {' · '}
                {form.seriesOrderDefault}
              </span>
            )}
          </Option>
        ))}
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

function Constraints({
  asked,
  moods,
}: {
  asked: Asked
  moods: readonly string[]
}) {
  const { form } = SESSIONS
  const year = { type: 'number', min: 1870, max: 2100 } as const
  return (
    <Section
      id="restricoes"
      title={form.constraints}
      lead={form.constraintsLead}
      plain
    >
      <div className="flex flex-col gap-sm">
        <Option name="sem-ja-visto" shape="row" defaultChecked={asked.unseen}>
          {form.unseen}
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
        name="sem-climas"
        label={form.noMoods}
        hint={form.noMoodsHint(moods)}
        defaultValue={asked.noMoods?.join(', ')}
      />
      <TextField
        name="gatilhos"
        label={form.triggers}
        hint={form.triggersHint}
        defaultValue={asked.triggers?.join(', ')}
      />
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
