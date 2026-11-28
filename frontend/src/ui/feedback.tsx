import { useState } from 'react'
import {
  RATING_CHOICES,
  REPORT_CHOICES,
  isFeedbackRefusal,
  type FeedbackDraft,
  type FeedbackRefusal,
} from '#/content/feedback-form'
import { feedbackPath, sessionPath } from '#/content/session-paths'
import type { SearchAnswer } from '#/platform/catalog-search'
import type { FeedbackAttendee, FeedbackPage } from '#/platform/feedback'
import { FEEDBACK } from './feedback.copy'
import { ImportsFrame } from './imports'
import { useFetchForm, useHydrated } from './kit/fetch-form'
import { refusalOn, useRefusalInPlace } from './kit/refusal-in-place'
import { buttonVariants } from './kit/button-variants'
import { Option } from './kit/option'
import { PriceSticker } from './kit/sticker'
import { OwnerTag } from './kit/owner-tag'
import {
  Alert,
  PostFailed,
  Item,
  Items,
  Section,
  SessionFilmLookup,
  Submit,
  TextField,
} from './person-parts'
import { names } from './session-names'
import { sessionLabel } from './billboard-request'
import {
  Avatars,
  SessionDate,
  PersonAvatar,
  NightRequest,
} from './session-parts'

/** `feedbackPath(<sessao>)`: the form that records the Session's Feedback and
 * closes it, and the satisfaction of its Presentes now. A plain POST to
 * `/feedback/<sessao>/enviar`: it works before the JavaScript. `page` is
 * `'unknown'` when no open Session has that id, null when the engine cannot
 * run on this server. The Catálogo search (`search`) comes first: its
 * "Usar" comes back with `film` chosen, from the list or as "Outro filme".
 * `draft` holds the reactions and comments the search kept, in the note
 * `note`: the form comes back with them, and "Usar" keeps them. */
export function FeedbackScreen({
  session,
  page,
  refusal,
  search = null,
  film,
  draft = null,
  note,
  told,
  correcting = false,
  nothing = false,
}: {
  session: string
  page: FeedbackPage | 'unknown' | null
  /** No open Session by that id, but a told one: what they saw (#272),
   * and whether the Dono looking was there to correct it (#344). */
  told?: { title: string | null; mine: boolean }
  /** The form corrects a told Session, filled with what was told (#344). */
  correcting?: boolean
  /** "Não vimos nada" comes marked: what the corrected Session told. */
  nothing?: boolean
  refusal?: FeedbackRefusal
  search?: SearchAnswer | null
  film?: string
  draft?: FeedbackDraft | null
  note?: string
}) {
  const path = feedbackPath(session)
  const pick = (id: string) => {
    const params = new URLSearchParams({ filme: id })
    if (search) params.set('buscar', search.query)
    if (note) params.set('nota', note)
    if (correcting) params.set('corrigir', 'sim')
    return `${path}?${params.toString()}`
  }
  return (
    <ImportsFrame back={FEEDBACK.back} backTo={sessionPath(session)}>
      {page === null ? (
        <Alert>{FEEDBACK.unavailable}</Alert>
      ) : page === 'unknown' ? (
        <NotOpen session={session} told={told} />
      ) : (
        <>
          <Heading page={page} correcting={correcting} />
          <FeedbackForm
            key={`${session} ${film ?? ''} ${search?.query ?? ''} ${note ?? ''}`}
            session={session}
            page={page}
            film={film}
            search={search}
            draft={draft}
            pick={pick}
            refusal={refusal}
            correcting={correcting}
            nothing={nothing}
          />
        </>
      )}
    </ImportsFrame>
  )
}

/** No open Session to tell (#272): told already, with what they saw and
 * the way to it, or none by that id. */
function NotOpen({
  session,
  told,
}: {
  session: string
  told?: { title: string | null; mine: boolean }
}) {
  const { form } = FEEDBACK
  return (
    <section className="flex flex-col gap-lg">
      <h1 className="font-display text-counter-title">
        {told ? form.told(told.title) : form.unknown}
      </h1>
      {!told && <p className="text-ink-2">{form.unknownLead}</p>}
      <div className="flex flex-wrap items-center gap-lg">
        <a
          href={told ? sessionPath(session) : '/sessoes'}
          className={buttonVariants({ variant: 'option' })}
        >
          {told ? form.toSession : form.toList}
        </a>
        {told?.mine && (
          <a
            href={`${feedbackPath(session)}?corrigir=sim`}
            className={buttonVariants({ variant: 'link' })}
          >
            {form.correct}
          </a>
        )}
      </div>
    </section>
  )
}

/** The page's head: the title, then who was there and when, and what the
 * Dono asked in her words, on the yellow paper. */
function Heading({
  page,
  correcting,
}: {
  page: FeedbackPage
  correcting: boolean
}) {
  const { form } = FEEDBACK
  return (
    <div className="flex flex-col gap-lg">
      <h1 className="font-display text-counter-title">
        {correcting ? form.correctTitle : form.title}
      </h1>
      {correcting && <p className="text-ink-2">{form.correctLead}</p>}
      <div className="flex items-center gap-lg">
        <Avatars people={page.attendees} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-meta text-ink-2">
            <SessionDate date={page.date} />
          </span>
          <span className="font-display text-step-title">
            {names(page.attendees)}
          </span>
        </span>
      </div>
      <NightRequest
        items={sessionLabel(page)}
        note={page.request}
        added={page.additions}
      />
    </div>
  )
}

function FeedbackForm({
  session,
  page,
  film,
  search,
  draft,
  pick,
  refusal,
  correcting,
  nothing,
}: {
  session: string
  page: FeedbackPage
  film?: string
  search: SearchAnswer | null
  draft: FeedbackDraft | null
  pick: (id: string) => string
  refusal?: FeedbackRefusal
  correcting: boolean
  nothing: boolean
}) {
  const { form } = FEEDBACK
  const listed = shelfOf(page).some((item) => item.id === film)
  const other = !listed && (film !== undefined || search !== null)
  const [choice, setChoice] = useState(() =>
    firstChoice(page, film, other, nothing),
  )
  const { refused, alert, onAnswer } = useRefusalInPlace(
    refusal,
    refusalOn(isFeedbackRefusal, feedbackPath(session)),
  )
  const { onSubmit, busy, failed } = useFetchForm(onAnswer)
  // A refusal about the film goes once a film is chosen (#272).
  const [fixed, setFixed] = useState(false)
  const alone = page.attendees.length === 1
  return (
    <form
      method="post"
      action={`/feedback/${encodeURIComponent(session)}/enviar`}
      aria-label={form.label}
      className="group/feedback flex flex-col gap-3xl"
      onSubmit={onSubmit}
    >
      {/* Enter in any field sends the form: the first submit button is the
          one Enter presses. With a search not run yet in its field, the
          server searches instead (`searchAsked`). */}
      <button type="submit" name="tecla" value="enter" hidden>
        {form.submit}
      </button>
      {correcting && <input type="hidden" name="corrigir" value="sim" />}
      {refused && !(fixed && FILM_REFUSALS.has(refused)) && (
        <div ref={alert}>
          <Alert>{FEEDBACK.refusals[refused]}</Alert>
        </div>
      )}
      <PostFailed failed={failed} />
      <FilmChoice
        page={page}
        film={film}
        other={other}
        search={search}
        pick={pick}
        choice={choice}
        onChoose={(value) => {
          setChoice(value)
          setFixed(true)
        }}
      />

      {/* The reactions once a film is chosen, before the JavaScript too;
          none for "não vimos nada". */}
      <fieldset
        disabled={choice === 'nada'}
        className="hidden min-w-0 group-has-[input[name=filme]:checked]/feedback:block group-has-[input[value=nada]:checked]/feedback:hidden"
      >
        <Section
          id="reacoes"
          title={form.reactions(alone)}
          lead={form.reactionsLead}
        >
          <div className="flex flex-col">
            {page.attendees.map((attendee, index) => (
              <Reaction
                key={attendee.person}
                attendee={attendee}
                index={index}
                kept={draft?.[attendee.person]}
              />
            ))}
          </div>
        </Section>
      </fieldset>

      {!alone && <Satisfaction page={page} />}
      <SendBar busy={busy !== null} correcting={correcting} />
    </form>
  )
}

/** The way out, a thumb away as the Cartaz's Enviar: it records, or
 * records the correction (#344). */
function SendBar({ busy, correcting }: { busy: boolean; correcting: boolean }) {
  const { form } = FEEDBACK
  const label = correcting ? form.correctSubmit : form.submit
  return (
    <div className="sticky bottom-[calc(68px+env(safe-area-inset-bottom))] z-10 rounded-t-panel border-x border-t border-rule bg-surface px-lg py-sm min-[900px]:bottom-0">
      <Submit variant="primary" disabled={busy} className="w-full sm:w-auto">
        {busy ? form.submitting : label}
      </Submit>
    </div>
  )
}

/** The film radio marked first: "não vimos nada" when the corrected
 * Session told it (#344), a film of the list, `outro`, or with none asked,
 * the one the Cartaz points to (#272). */
function firstChoice(
  page: FeedbackPage,
  film: string | undefined,
  other: boolean,
  nothing: boolean,
): string | undefined {
  if (nothing) return 'nada'
  if (shelfOf(page).some((item) => item.id === film)) return film
  return other ? 'outro' : likelyFilm(page)
}

/** Every film the Session showed: the current shelf, then the ones that
 * left it in a redo (#272). */
const shelfOf = (page: FeedbackPage) => [
  ...page.recommendation,
  ...page.earlier,
]

/** The film the Cartaz points to (#272): the one with the most stars (the
 * first of a tie), else the only one on the shelf. */
function likelyFilm(page: FeedbackPage): string | undefined {
  const starred = shelfOf(page)
    .filter((item) => (page.stars[item.id] ?? 0) > 0)
    .toSorted((a, b) => (page.stars[b.id] ?? 0) - (page.stars[a.id] ?? 0))
  if (starred[0]) return starred[0].id
  return page.recommendation.length === 1
    ? page.recommendation[0]?.id
    : undefined
}

/** The refusals a film's choice answers. */
const FILM_REFUSALS: ReadonlySet<FeedbackRefusal> = new Set<FeedbackRefusal>([
  'filme',
  'nada',
])

/** The chosen film or a title to look up. `choice` is the radio marked.
 * With the JavaScript, "Usar" takes the film in place: its radio when the
 * list has it, else "Outro filme" with its id in the field; before it,
 * "Usar" is a link (`pick`). */
function FilmChoice({
  page,
  film,
  other,
  search,
  pick,
  choice,
  onChoose,
}: {
  page: FeedbackPage
  film?: string
  other: boolean
  search: SearchAnswer | null
  pick: (id: string) => string
  choice?: string
  onChoose: (value: string) => void
}) {
  const { form } = FEEDBACK
  const alone = page.attendees.length === 1
  const live = useHydrated()
  const selected =
    search && 'found' in search
      ? search.found.films.find((item) => item.id === film)
      : undefined
  // The title of the film the field holds, until the Dono types over it.
  const [title, setTitle] = useState(other ? selected?.title : undefined)
  const take = (picked: { id: string; label: string }) => {
    const inList = shelfOf(page).some((item) => item.id === picked.id)
    onChoose(inList ? picked.id : 'outro')
    setTitle(inList ? undefined : picked.label)
  }
  const radio = (value: string) => ({
    type: 'radio' as const,
    shape: 'row' as const,
    name: 'filme',
    value,
    checked: choice === value,
    onChange: (checked: boolean) => {
      if (checked) onChoose(value)
    },
  })
  return (
    <Section id="filme" title={form.film(alone)}>
      <fieldset className="group/film flex min-w-0 flex-col gap-sm">
        <legend className="sr-only">{form.film(alone)}</legend>
        {page.recommendation.map((item) => (
          <Option key={item.id} {...radio(item.id)}>
            <span className="flex items-center gap-md">
              <PriceSticker compact>{item.position}</PriceSticker>
              <span className="font-display text-row-title">{item.title}</span>
              <Stars stars={page.stars[item.id]} />
            </span>
          </Option>
        ))}
        {page.earlier.length > 0 && (
          <p className="pt-sm text-meta font-semibold text-ink-2">
            {form.earlier}
          </p>
        )}
        {page.earlier.map((item) => (
          <Option key={item.id} {...radio(item.id)}>
            <span className="flex items-center gap-md">
              <span className="font-display text-row-title">{item.title}</span>
              <Stars stars={page.stars[item.id]} />
            </span>
          </Option>
        ))}
        <Option {...radio('outro')}>{form.other}</Option>
        <div className="hidden flex-col gap-sm rounded-field border border-rule bg-surface-2 p-lg group-has-[input[value=outro]:checked]/film:flex">
          {title && <p className="font-semibold">{title}</p>}
          <SessionFilmLookup
            name="busca"
            label={form.search}
            value={other ? (film ?? search?.query) : undefined}
            answer={search}
            pick={pick}
            onPick={live ? take : undefined}
            fill
            onType={() => setTitle(undefined)}
          />
        </div>
        <Option {...radio('nada')}>{form.nothing(alone)}</Option>
      </fieldset>
    </Section>
  )
}

/** The stars the Cartaz gave a film, as a quiet note: "4 de 5 ★". */
function Stars({ stars }: { stars: number | undefined }) {
  if (!stars) return null
  return (
    <span className="shrink-0 text-meta font-normal text-ink-2">
      {FEEDBACK.form.stars(stars)}
    </span>
  )
}

/** The 1 to 10 as radios (#272), the Cartaz's Escala de nota for a form
 * that posts before the JavaScript: ten circles, the chosen one orange; a
 * 5 by 2 grid on a phone. */
function RatingRadios({
  name,
  label,
  value,
}: {
  name: string
  label: string
  value: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid grid-cols-5 gap-0.75 min-[480px]:grid-cols-10"
    >
      {RATING_CHOICES.map((n) => (
        <label
          key={n}
          className="group/rating relative grid h-touch min-w-0 cursor-pointer place-items-center rounded-rail bg-surface-2 font-display text-field-label text-ink tabular-nums has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus"
        >
          <input
            type="radio"
            name={name}
            value={`nota:${n}`}
            defaultChecked={value === `nota:${n}`}
            aria-label={n}
            className="absolute inset-0 m-0 size-full cursor-pointer opacity-0"
          />
          <span
            aria-hidden="true"
            className="grid size-7 place-items-center rounded-round group-has-checked/rating:bg-sticker-orange group-has-checked/rating:text-on-sticker"
          >
            {n}
          </span>
        </label>
      ))}
    </div>
  )
}

/** One Presente's reaction (#272): her avatar in the Session's colour and
 * her name, the 1 to 10, then one row of pills: "sem nota" and, for the
 * others, the Relato (gostou, neutro, não gostou), which the Dono does not
 * give about herself; then "comentar". Every row has the same parts in the
 * same place. Filled with what the Catálogo search `kept`. */
function Reaction({
  attendee,
  index,
  kept,
}: {
  attendee: FeedbackAttendee
  index: number
  kept?: FeedbackDraft[string]
}) {
  const { form } = FEEDBACK
  const name = `reacao.${attendee.person}`
  const value = kept?.reaction ?? ''
  return (
    <fieldset className="flex min-w-0 flex-col gap-sm border-dashed border-rule py-lg first:pt-0 not-first:border-t">
      <legend className="float-left w-full">
        <span className="flex items-center gap-sm font-display text-row-title">
          <PersonAvatar person={attendee} index={index} />
          {attendee.name}
          {attendee.owner && <OwnerTag />}
        </span>
      </legend>
      <div className="clear-left pt-sm">
        <RatingRadios
          name={name}
          label={form.ratingLabel(attendee.name)}
          value={value}
        />
      </div>
      <div className="flex flex-wrap gap-sm">
        <Option type="radio" name={name} value="" defaultChecked={value === ''}>
          {attendee.owner ? form.noRating : form.none}
        </Option>
        {!attendee.owner &&
          Object.entries(REPORT_CHOICES).map(([report, label]) => (
            <Option
              key={report}
              type="radio"
              name={name}
              value={`relato:${report}`}
              defaultChecked={value === `relato:${report}`}
            >
              {label}
            </Option>
          ))}
      </div>
      <details open={Boolean(kept?.comment)} className="flex flex-col">
        <summary className="flex min-h-touch cursor-pointer list-none items-center text-meta font-semibold text-ink underline underline-offset-2 [&::-webkit-details-marker]:hidden">
          {form.openComment}
        </summary>
        <TextField
          name={`comentario.${attendee.person}`}
          label={`${form.comment}: ${attendee.name}`}
          defaultValue={kept?.comment}
        />
      </details>
    </fieldset>
  )
}

function Satisfaction({ page }: { page: FeedbackPage }) {
  const { satisfaction } = FEEDBACK
  return (
    <Section
      id="satisfacao"
      title={satisfaction.title}
      lead={satisfaction.lead}
    >
      <Items empty={satisfaction.empty}>
        {page.satisfaction.flatMap((c) =>
          c.line === null || c.satisfaction === null
            ? []
            : [
                <Item key={c.person}>
                  {/* Small, under the block's own lead (#272). */}
                  <span className="text-meta text-ink">{c.line}</span>
                </Item>,
              ],
        )}
      </Items>
    </Section>
  )
}
