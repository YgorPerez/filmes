import { sessionPath } from '#/content/session-paths'
import type { SessionItem, SessionPerson } from '#/platform/sessions'
import { ImportsFrame } from './imports'
import { Option } from './kit/option'
import { OwnerTag } from './kit/owner-tag'
import { Alert } from './kit/status'
import { Section, Submit } from './person-parts'
import { SESSIONS } from './sessions.copy'

export function AttendeeOptions({
  people,
  selected,
}: {
  people: readonly SessionPerson[]
  selected?: readonly string[]
}) {
  const attending = selected && new Set(selected)
  return (
    <Section id="presentes" title={SESSIONS.form.attendees}>
      <div className="flex flex-wrap gap-sm">
        {people.map((person) => (
          <Option
            key={person.person}
            name="presentes"
            value={person.person}
            defaultChecked={
              attending ? attending.has(person.person) : person.owner
            }
          >
            <span className="flex items-center gap-sm">
              {person.name}
              {person.owner && <OwnerTag />}
            </span>
          </Option>
        ))}
      </div>
    </Section>
  )
}

export function SessionAttendees({
  session,
  people,
  refusal,
}: {
  session: SessionItem
  people: readonly SessionPerson[] | null
  refusal?: 'vazio' | 'falha'
}) {
  const path = sessionPath(session.id)
  const copy = SESSIONS.editAttendees
  return (
    <ImportsFrame back={copy.back} backTo={path}>
      <h1 className="font-display text-counter-title">{copy.title}</h1>
      {people === null ? (
        <Alert>{SESSIONS.unavailable}</Alert>
      ) : (
        <form
          method="post"
          action={`${path}/editar-presentes`}
          className="flex flex-col gap-xl"
        >
          {!session.open && <input type="hidden" name="contada" value="sim" />}
          {refusal && <Alert>{copy.refusals[refusal]}</Alert>}
          <AttendeeOptions
            people={people}
            selected={session.attendees.map((a) => a.person)}
          />
          <Submit variant="primary" className="self-start">
            {session.open ? copy.redo : copy.correct}
          </Submit>
        </form>
      )}
    </ImportsFrame>
  )
}
