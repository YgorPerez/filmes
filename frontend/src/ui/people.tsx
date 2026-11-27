import {
  isPersonCreateRefusal,
  type PersonCreateRefusal,
  type TypedPerson,
} from '#/content/person-create'
import type { PersonEntry } from '#/platform/people'
import { personPath } from '#/content/paths'
import { PEOPLE } from './people.copy'
import { useFetchForm } from './kit/fetch-form'
import { OwnerTag } from './kit/owner-tag'
import { refusalOn, useRefusalInPlace } from './kit/refusal-in-place'
import {
  Alert,
  Disclosure,
  PostFailed,
  Submit,
  TextField,
} from './person-parts'
import { RowArrow } from './kit/row-arrow'

/** The create form as it comes back: why it was refused, what was typed. */
export type CreateState = {
  refusal?: PersonCreateRefusal
  typed: TypedPerson
}

/** The logged-in Dono first; the others in the engine's order. */
const selfFirst = (people: PersonEntry[], self?: string) => [
  ...people.filter((p) => p.person === self),
  ...people.filter((p) => p.person !== self),
]

/** `/pessoas`: every Pessoa of filmes-dados, each a link to her page; the
 * logged-in Dono (`self`) first, to Meu gosto. `people` is null when the
 * engine cannot run on this server. */
export function PeopleList({
  people,
  self,
  gone = false,
  create,
}: {
  people: PersonEntry[] | null
  self?: string
  gone?: boolean
  create?: CreateState
}) {
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-3xl px-2xl py-3xl">
      <div className="flex flex-col gap-sm">
        <h1 className="font-display text-title">{PEOPLE.title}</h1>
        <p className="text-ink-2">{PEOPLE.lead}</p>
      </div>
      {gone && <Alert>{PEOPLE.gone}</Alert>}
      {!people ? (
        <Alert>{PEOPLE.unavailable}</Alert>
      ) : people.length === 0 ? (
        <p className="text-ink-2">{PEOPLE.empty}</p>
      ) : (
        <ul className="flex flex-col gap-xs" aria-label={PEOPLE.title}>
          {selfFirst(people, self).map(({ person, name, aliases, owner }) => (
            <li key={person}>
              <a
                href={personPath(person, person === self)}
                className="flex min-h-[52px] items-stretch overflow-hidden rounded-nav-row border border-rule bg-surface text-ink no-underline hover:bg-surface-2"
              >
                <span aria-hidden="true" className="w-2 shrink-0 border-r border-case-edge bg-case" />
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-sm gap-y-2xs py-sm pl-xl">
                  <span className="font-display text-row-title">{name}</span>
                  {owner && <OwnerTag />}
                  {person === self && (
                    <span className="text-meta text-ink-2">
                      {PEOPLE.myTaste}
                    </span>
                  )}
                  {aliases.length > 0 && (
                    <span className="text-meta text-ink-2">
                      {PEOPLE.aliases(aliases)}
                    </span>
                  )}
                </span>
                <span className="flex items-center px-xl">
                  <RowArrow />
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {people && <CreateForm state={create} />}
    </main>
  )
}

/** "Acrescentar Pessoa": a plain POST, so it works before the JavaScript.
 * Open, with what was typed and why not, when the server refused it. With
 * the JavaScript (#235), it posts by `fetch`: a refusal shows in place,
 * over what was typed, and the new Pessoa's page opens without reloading. */
function CreateForm({ state }: { state?: CreateState }) {
  const { create } = PEOPLE
  const typed = state?.typed ?? {}
  const { refused, alert, onAnswer } = useRefusalInPlace(
    state?.refusal,
    refusalOn(isPersonCreateRefusal),
  )
  const { onSubmit, busy, failed } = useFetchForm(onAnswer)
  return (
    <Disclosure summary={create.title} open={state?.refusal !== undefined}>
      <form
        method="post"
        action="/pessoas/nova/enviar"
        aria-label={create.title}
        onSubmit={onSubmit}
        className="flex flex-col gap-xl"
      >
        {refused && (
          <div ref={alert}>
            <Alert>{create.refusals[refused]}</Alert>
          </div>
        )}
        <PostFailed failed={failed} />
        <TextField
          name="nome"
          label={create.name}
          required
          defaultValue={typed.name}
        />
        <TextField
          name="apelidos"
          label={create.aliases}
          hint={create.aliasesHint}
          placeholder="Lu, Luana"
          defaultValue={typed.aliases}
        />
        <label className="flex min-h-touch items-center gap-sm">
          <input
            type="checkbox"
            name="dono"
            value="sim"
            defaultChecked={typed.owner}
          />
          <span className="font-semibold">{create.owner}</span>
        </label>
        <TextField
          name="email"
          type="email"
          label={create.email}
          hint={create.emailHint}
          defaultValue={typed.email}
        />
        <p className="text-meta text-ink-2">{create.testUsers}</p>
        <Submit variant="primary" disabled={busy !== null}>
          {busy === null ? create.submit : create.submitting}
        </Submit>
      </form>
    </Disclosure>
  )
}
