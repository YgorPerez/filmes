import type { SessionEditRefusal } from '#/content/session-edit'
import { isSessionEditRefusal, sessionEditPath } from '#/content/session-edit'
import { sessionPath } from '#/content/session-paths'
import type { SessionEditPage } from '#/platform/session-edit'
import { ImportsFrame } from './imports'
import { useFetchForm } from './kit/fetch-form'
import { refusalOn, useRefusalInPlace } from './kit/refusal-in-place'
import { Alert, PostFailed } from './kit/status'
import { Constraints, Moods, SeriesOrder } from './new-session'
import { Disclosure, Section, Submit, TextField } from './person-parts'
import { SESSION_EDIT } from './session-edit.copy'
import { SESSIONS } from './sessions.copy'

const inputValue = (value: number | undefined) =>
  value === undefined ? undefined : String(value)

/** `/sessoes/<id>/pedido`: the request and Restrições of an open Session,
 * filled with its current version (#372). Saving is a plain POST to
 * `/sessoes/<id>/pedido/enviar`, which redoes the Session with the films
 * that still pass. `page` is null when the engine cannot run here. */
export function SessionEditScreen({
  id,
  page,
  refusal,
}: {
  id: string
  page: SessionEditPage | null
  refusal?: SessionEditRefusal
}) {
  return (
    <ImportsFrame back={SESSION_EDIT.back} backTo={sessionPath(id)}>
      <h1 className="font-display text-counter-title">{SESSION_EDIT.title}</h1>
      {page === null ? (
        <Alert>{SESSIONS.unavailable}</Alert>
      ) : page === 'unknown' ? (
        <Alert>{SESSION_EDIT.unknown}</Alert>
      ) : page === 'closed' ? (
        <Alert>{SESSION_EDIT.closed}</Alert>
      ) : page === 'absent' ? (
        <Alert>{SESSION_EDIT.absent}</Alert>
      ) : (
        <SessionEditForm page={page} refusal={refusal} />
      )}
    </ImportsFrame>
  )
}

function SessionEditForm({
  page,
  refusal,
}: {
  page: Exclude<SessionEditPage, string>
  refusal?: SessionEditRefusal
}) {
  const path = sessionEditPath(page.id)
  const { refused, alert, onAnswer } = useRefusalInPlace(
    refusal,
    refusalOn(isSessionEditRefusal, path),
  )
  const { onSubmit, busy, failed } = useFetchForm(onAnswer)
  return (
    <form
      method="post"
      action={`${path}/enviar`}
      aria-label={SESSION_EDIT.label}
      onSubmit={onSubmit}
      className="flex flex-col gap-3xl"
    >
      <p className="text-ink-2">{SESSION_EDIT.lead}</p>
      {refused && (
        <div ref={alert}>
          <Alert>{SESSION_EDIT.refusals[refused]}</Alert>
        </div>
      )}
      <PostFailed failed={failed} />
      <EditFields page={page} open={refused !== undefined} />
      <Submit variant="primary" disabled={busy !== null}>
        {busy === null ? SESSION_EDIT.submit : SESSION_EDIT.submitting}
      </Submit>
    </form>
  )
}

/** The request, the Climas, the duration and, under "Mais opções", the
 * Restrições, the similar and the Série na ordem. `open`: the fold comes
 * open, as after a refusal. */
function EditFields({
  page,
  open,
}: {
  page: Exclude<SessionEditPage, string>
  open: boolean
}) {
  const { form } = SESSIONS
  const asked = page.fields
  return (
    <>
      <TextField
        name="pedido"
        label={SESSION_EDIT.words}
        hint={SESSION_EDIT.wordsHint}
        defaultValue={asked.request}
      />
      <Moods moods={page.moods} asked={asked} />
      <Section id="duracao" title={form.time}>
        <TextField
          name="duracao"
          type="number"
          min={1}
          label={form.duration}
          hint={form.durationHint}
          defaultValue={inputValue(asked.maxDuration)}
        />
      </Section>
      <Disclosure
        summary={form.details}
        open={open || (asked.similar?.length ?? 0) > 0}
      >
        <div className="flex flex-col gap-3xl">
          <Constraints asked={asked} moods={page.moods} />
          <TextField
            name="parecido"
            label={form.similar}
            hint={form.similarHint}
            defaultValue={asked.similar?.join(', ')}
          />
          <SeriesOrder asked={asked} />
        </div>
      </Disclosure>
    </>
  )
}
