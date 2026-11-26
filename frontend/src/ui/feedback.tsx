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
import { useFetchForm, useHydrated, useRefusalInPlace } from './kit/fetch-form'
import { FIELD } from './kit/field'
import { FieldLabel } from './kit/field-label'
import { Option } from './kit/option'
import { PriceSticker } from './kit/sticker'
import { OwnerTag } from './kit/owner-tag'
import {
  Alert,
  Item,
  Items,
  Section,
  SessionFilmLookup,
  Submit,
  TextField,
} from './person-parts'
import {
  Avatars,
  SessionDate,
  names,
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
}: {
  session: string
  page: FeedbackPage | 'unknown' | null
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
    return `${path}?${params.toString()}`
  }
  return (
    <ImportsFrame back={FEEDBACK.back} backTo={sessionPath(session)}>
      {page === null ? (
        <Alert>{FEEDBACK.unavailable}</Alert>
      ) : page === 'unknown' ? (
        <Alert>{FEEDBACK.form.unknown}</Alert>
      ) : (
        <>
          <Heading page={page} />
          <FeedbackForm
            key={`${session} ${film ?? ''} ${search?.query ?? ''} ${note ?? ''}`}
            session={session}
            page={page}
            film={film}
            search={search}
            draft={draft}
            pick={pick}
            refusal={refusal}
          />
          {page.attendees.length > 1 && <Satisfaction page={page} />}
        </>
      )}
    </ImportsFrame>
  )
}

/** The page's head: the title, then who was there and when, and what the
 * Dono asked in her words, on the yellow paper. */
function Heading({ page }: { page: FeedbackPage }) {
  return (
    <div className="flex flex-col gap-lg">
      <h1 className="font-display text-counter-title">{FEEDBACK.form.title}</h1>
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
        items={[...page.moods, ...page.constraints]}
        note={page.request}
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
}: {
  session: string
  page: FeedbackPage
  film?: string
  search: SearchAnswer | null
  draft: FeedbackDraft | null
  pick: (id: string) => string
  refusal?: FeedbackRefusal
}) {
  const { form } = FEEDBACK
  const listed = page.recommendation.some((item) => item.id === film)
  const other = !listed && (film !== undefined || search !== null)
  // The film radio marked: a film of the list, `outro` or `nada`.
  const [choice, setChoice] = useState(
    listed ? film : other ? 'outro' : undefined,
  )
  const { refused, alert, onAnswer } = useRefusalInPlace(
    feedbackPath(session),
    isFeedbackRefusal,
    refusal,
  )
  const { onSubmit, busy } = useFetchForm(onAnswer)
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
      {refused && (
        <div ref={alert}>
          <Alert>{FEEDBACK.refusals[refused]}</Alert>
        </div>
      )}
      <FilmChoice
        page={page}
        film={film}
        other={other}
        search={search}
        pick={pick}
        choice={choice}
        onChoose={setChoice}
      />

      <fieldset
        disabled={choice === 'nada'}
        className="min-w-0 group-has-[input[value=nada]:checked]/feedback:hidden"
      >
        <Section id="reacoes" title={form.reactions} lead={form.reactionsLead}>
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

      <Submit
        variant="primary"
        disabled={busy !== null}
        className="w-full sm:w-auto sm:self-start"
      >
        {busy === null ? form.submit : form.submitting}
      </Submit>
    </form>
  )
}

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
  const live = useHydrated()
  const selected =
    search && 'found' in search
      ? search.found.films.find((item) => item.id === film)
      : undefined
  // The title of the film the field holds, until the Dono types over it.
  const [title, setTitle] = useState(other ? selected?.title : undefined)
  const take = (picked: { id: string; label: string }) => {
    const inList = page.recommendation.some((item) => item.id === picked.id)
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
    <Section id="filme" title={form.film}>
      <fieldset className="group/film flex min-w-0 flex-col gap-sm">
        <legend className="sr-only">{form.film}</legend>
        {page.recommendation.map((item) => (
          <Option key={item.id} {...radio(item.id)}>
            <span className="flex items-center gap-md">
              <PriceSticker compact>{item.position}</PriceSticker>
              <span className="text-[15px] font-bold">{item.title}</span>
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
        <Option {...radio('nada')}>{form.nothing}</Option>
      </fieldset>
    </Section>
  )
}

/** One Presente's reaction: her avatar in the Session's colour and her
 * name, the Nota or the Relato, and the comment; filled with what the
 * Catálogo search `kept`. */
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
  const id = `reacao-${attendee.person}`
  return (
    <fieldset className="border-dashed border-rule py-xl first:pt-0 not-first:border-t">
      <legend className="float-left w-full">
        <span className="flex items-center gap-sm font-display text-[15px] font-bold">
          <PersonAvatar person={attendee} index={index} />
          {attendee.name}
          {attendee.owner && <OwnerTag />}
        </span>
      </legend>
      <div className="clear-left grid grid-cols-1 gap-lg pt-lg sm:grid-cols-2">
        <FieldLabel label={form.reaction}>
          <select
            id={id}
            aria-label={`${form.reaction}: ${attendee.name}`}
            name={`reacao.${attendee.person}`}
            defaultValue={kept?.reaction ?? ''}
            className={`${FIELD} w-full`}
          >
            <option value="">{form.none}</option>
            <optgroup label={form.ratings}>
              {RATING_CHOICES.map((value) => (
                <option key={value} value={`nota:${value}`}>
                  {form.rating(value)}
                </option>
              ))}
            </optgroup>
            {!attendee.owner && (
              <optgroup label={form.reports}>
                {Object.entries(REPORT_CHOICES).map(([value, label]) => (
                  <option key={value} value={`relato:${value}`}>
                    {label}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </FieldLabel>
        <TextField
          name={`comentario.${attendee.person}`}
          label={`${form.comment}: ${attendee.name}`}
          defaultValue={kept?.comment}
        />
      </div>
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
                  <span>{c.line}</span>
                </Item>,
              ],
        )}
      </Items>
    </Section>
  )
}
