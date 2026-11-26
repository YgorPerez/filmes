import {
  RATING_CHOICES,
  REPORT_CHOICES,
  type FeedbackRefusal,
} from '#/content/feedback-form'
import { feedbackPath, sessionPath } from '#/content/session-paths'
import type { SearchAnswer } from '#/platform/catalog-search'
import type { FeedbackAttendee, FeedbackPage } from '#/platform/feedback'
import { FEEDBACK } from './feedback.copy'
import { ImportsFrame } from './imports'
import { FIELD } from './kit/field'
import { FieldLabel } from './kit/field-label'
import { Option } from './kit/option'
import { PriceSticker } from './kit/sticker'
import { OwnerTag } from './kit/owner-tag'
import {
  Alert,
  CatalogSearch,
  Item,
  Items,
  Meta,
  Section,
  Submit,
  TextField,
} from './person-parts'
import {
  Avatars,
  DateLabel,
  names,
  PersonAvatar,
  NightRequest,
  SearchFold,
} from './session-parts'

/** `feedbackPath(<sessao>)`: the form that records the Session's Feedback and
 * closes it, and the satisfaction of its Presentes now. A plain POST to
 * `/feedback/<sessao>/enviar`: it works before the JavaScript. `page` is
 * `'unknown'` when no open Session has that id, null when the engine cannot
 * run on this server. The Catálogo search (`search`) comes first: its
 * "Usar" comes back with `film` chosen, from the list or as "Outro filme". */
export function FeedbackScreen({
  session,
  page,
  refusal,
  search = null,
  film,
}: {
  session: string
  page: FeedbackPage | 'unknown' | null
  refusal?: FeedbackRefusal
  search?: SearchAnswer | null
  film?: string
}) {
  const path = feedbackPath(session)
  const pick = (id: string) => {
    const params = new URLSearchParams({ filme: id })
    if (search) params.set('buscar', search.query)
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
          {refusal && <Alert>{FEEDBACK.refusals[refusal]}</Alert>}
          <SearchFold
            summary={FEEDBACK.form.searchFold}
            hint={FEEDBACK.form.searchFoldHint}
            open={search !== null}
          >
            <CatalogSearch
              action={path}
              scope="films"
              answer={search}
              pick={pick}
            />
          </SearchFold>
          <FeedbackForm session={session} page={page} film={film} />
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
      <h1 className="font-display text-title">{FEEDBACK.form.title}</h1>
      <div className="flex items-center gap-lg">
        <Avatars people={page.attendees} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <DateLabel>{page.date}</DateLabel>
          <span className="font-display text-step-title">
            {names(page.attendees)}
          </span>
        </span>
      </div>
      <NightRequest items={[]} note={page.request} />
    </div>
  )
}

function FeedbackForm({
  session,
  page,
  film,
}: {
  session: string
  page: FeedbackPage
  film?: string
}) {
  const { form } = FEEDBACK
  return (
    <form
      method="post"
      action={`/feedback/${encodeURIComponent(session)}/enviar`}
      aria-label={form.label}
      className="flex flex-col gap-3xl"
    >
      <FilmChoice page={page} film={film} />

      <Section id="reacoes" title={form.reactions} lead={form.reactionsLead}>
        <div className="flex flex-col">
          {page.attendees.map((attendee, index) => (
            <Reaction key={attendee.person} attendee={attendee} index={index} />
          ))}
        </div>
      </Section>

      <Submit variant="primary" className="w-full sm:w-auto sm:self-start">
        {form.submit}
      </Submit>
    </form>
  )
}

/** Which film they saw: one of the list (its tape: the price sticker with
 * its number and its title), another (`busca`), or none. `film` comes
 * chosen (the Catálogo search's "Usar"). */
function FilmChoice({ page, film }: { page: FeedbackPage; film?: string }) {
  const { form } = FEEDBACK
  const listed = page.recommendation.some((f) => f.id === film)
  const other = film !== undefined && !listed
  return (
    <Section id="filme" title={form.film}>
      <div className="flex flex-col gap-sm" role="radiogroup">
        {page.recommendation.map((item) => (
          <Option
            key={item.id}
            type="radio"
            shape="row"
            name="filme"
            value={item.id}
            defaultChecked={item.id === film}
          >
            <span className="flex items-center gap-md">
              <PriceSticker compact>{item.position}</PriceSticker>
              <span className="text-[15px] font-bold">{item.title}</span>
            </span>
          </Option>
        ))}
        <Option
          type="radio"
          shape="row"
          name="filme"
          value="outro"
          defaultChecked={other}
        >
          {form.other}
        </Option>
      </div>
      <TextField
        name="busca"
        label={form.search}
        hint={form.searchHint}
        placeholder="tt…"
        defaultValue={other ? film : undefined}
      />
      <Option type="radio" shape="row" name="filme" value="nada">
        {form.nothing}{' '}
        <span className="font-body text-meta font-normal text-ink-2">
          {form.nothingHint}
        </span>
      </Option>
    </Section>
  )
}

/** One Presente's reaction: her avatar in the Session's colour and her
 * name, the Nota or the Relato, and the comment. */
function Reaction({
  attendee,
  index,
}: {
  attendee: FeedbackAttendee
  index: number
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
            defaultValue=""
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
          hint={form.commentHint}
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
                  <span className="font-semibold">{c.name}</span>
                  <span>{c.line}</span>
                  <Meta parts={[satisfaction.value(c.satisfaction)]} />
                </Item>,
              ],
        )}
      </Items>
    </Section>
  )
}
