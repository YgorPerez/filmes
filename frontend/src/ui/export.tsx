import type { ExportRefusal } from '#/content/export-refusal'
import { EXPORT } from './export.copy'
import { Brand } from './kit/brand'
import { FIELD } from './kit/field'
import { FieldLabel } from './kit/field-label'
import { Slip } from './kit/slip'
import { PageHead } from './kit/page-head'
import { Alert } from './kit/status'
import { Button, buttonVariants } from './shadcn/button'

export type ExportPeople = {
  people: { person: string; name: string; ratings: number }[]
  /** The slug chosen when the page opens: the Dono's own. */
  selected: string
}

/** The download: whose Notas, and the screen's one orange button. A plain
 * GET to the file, so the browser saves it and the page stays. */
function Download({ choices }: { choices: ExportPeople }) {
  return (
    <form
      method="get"
      action="/exportar/imdb.csv"
      className="flex flex-col gap-xl rounded-card border border-rule bg-surface px-xl pt-2xl pb-xl"
    >
      <FieldLabel label={EXPORT.person} hint={EXPORT.personHint}>
        <select
          name="pessoa"
          defaultValue={choices.selected}
          className={`${FIELD} w-full`}
        >
          {choices.people.map(({ person, name, ratings }) => (
            <option key={person} value={person}>
              {EXPORT.option(name, ratings)}
            </option>
          ))}
        </select>
      </FieldLabel>
      <Button type="submit" className="w-full sm:w-auto sm:self-start">
        {EXPORT.download}
      </Button>
    </form>
  )
}

/** Taking the file to the MovieLens, step by step. */
function Movielens() {
  return (
    <Slip id="movielens" title={EXPORT.movielensTitle}>
      <ol className="flex flex-col gap-md">
        {EXPORT.movielens.map((step, index) => (
          <li key={step} className="flex items-start gap-md">
            <span
              aria-hidden="true"
              className="grid size-6 shrink-0 place-items-center rounded-round border-[1.5px] border-rule font-display text-[13px] font-bold tabular-nums"
            >
              {index + 1}
            </span>
            <span className="text-evidence">{step}</span>
          </li>
        ))}
      </ol>
    </Slip>
  )
}

/** `/exportar`: a Pessoa's Notas as the IMDb CSV, and how to take it to the
 * MovieLens. It works before the JavaScript loads. `choices` is null when
 * the engine cannot run on this server. */
export function Export({
  choices,
  refusal,
}: {
  choices: ExportPeople | null
  refusal?: ExportRefusal
}) {
  const alert = !choices
    ? EXPORT.unavailable
    : refusal && EXPORT.refusals[refusal]
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-3xl px-2xl py-3xl">
      <header className="flex flex-wrap items-center justify-between gap-xl">
        <Brand />
        <a href="/" className={buttonVariants({ variant: 'option' })}>
          {EXPORT.back}
        </a>
      </header>
      <PageHead title={EXPORT.title} lead={EXPORT.lead} />
      {alert && <Alert>{alert}</Alert>}
      {choices && <Download choices={choices} />}
      <Movielens />
    </main>
  )
}
