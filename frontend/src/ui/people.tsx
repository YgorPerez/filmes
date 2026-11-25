import type { PersonCreateRefusal, TypedPerson } from '#/content/person-create'
import type { PersonEntry } from '#/platform/people'
import { Marquee } from './marquee'
import { PEOPLE } from './person.copy'
import { Alert, Disclosure, OwnerTag, Submit, TextField } from './person-parts'
import { buttonVariants } from './shadcn/button'

/** The create form as it comes back: why it was refused, what was typed. */
export type CreateState = {
  refusal?: PersonCreateRefusal
  typed: TypedPerson
}

/** `/pessoas`: every Pessoa of filmes-dados, each a link to her page.
 * `people` is null when the engine cannot run on this server. */
export function PeopleList({
  people,
  gone = false,
  create,
}: {
  people: PersonEntry[] | null
  gone?: boolean
  create?: CreateState
}) {
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-xl px-lg py-xl">
      <header className="flex flex-wrap items-center justify-between gap-md">
        <Marquee words={['filmes']} />
        <a href="/" className={buttonVariants({ variant: 'quiet' })}>
          {PEOPLE.back}
        </a>
      </header>
      <div className="flex flex-col gap-sm">
        <h1 className="text-title">{PEOPLE.title}</h1>
        <p className="text-ink-2">{PEOPLE.lead}</p>
      </div>
      {gone && <Alert>{PEOPLE.gone}</Alert>}
      {!people ? (
        <Alert>{PEOPLE.unavailable}</Alert>
      ) : people.length === 0 ? (
        <p className="text-ink-2">{PEOPLE.empty}</p>
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-card border border-rule bg-surface">
          {people.map(({ person, name, aliases, owner }) => (
            <li key={person} className="border-rule not-first:border-t">
              <a
                href={`/pessoas/${encodeURIComponent(person)}`}
                className="flex min-h-touch flex-wrap items-center gap-x-sm gap-y-xs px-md py-sm text-ink no-underline"
              >
                <span className="font-semibold">{name}</span>
                {owner && <OwnerTag />}
                {aliases.length > 0 && (
                  <span className="text-meta text-ink-2">
                    {PEOPLE.aliases(aliases)}
                  </span>
                )}
                <span aria-hidden="true" className="ml-auto text-ink-2">
                  ›
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
 * Open, with what was typed and why not, when the server refused it. */
function CreateForm({ state }: { state?: CreateState }) {
  const { create } = PEOPLE
  const typed = state?.typed ?? {}
  return (
    <Disclosure summary={create.title} open={state?.refusal !== undefined}>
      <form
        method="post"
        action="/pessoas/nova/enviar"
        aria-label={create.title}
        className="flex flex-col gap-md"
      >
        {state?.refusal && <Alert>{create.refusals[state.refusal]}</Alert>}
        <TextField
          name="nome"
          label={create.name}
          required
          defaultValue={typed.nome}
        />
        <TextField
          name="apelidos"
          label={create.aliases}
          hint={create.aliasesHint}
          placeholder="Lu, Luana"
          defaultValue={typed.apelidos}
        />
        <label className="flex min-h-touch items-center gap-sm">
          <input
            type="checkbox"
            name="dono"
            value="sim"
            defaultChecked={typed.dono === 'sim'}
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
        <Submit variant="primary">{create.submit}</Submit>
      </form>
    </Disclosure>
  )
}
