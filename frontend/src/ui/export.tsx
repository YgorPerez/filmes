import { FIELD } from './kit/field'
import type { ExportRefusal } from '#/content/export-refusal'
import { EXPORT } from './export.copy'
import { Brand } from './kit/brand'
import { Button, buttonVariants } from './shadcn/button'

export type ExportPeople = {
  people: { person: string; name: string; ratings: number }[]
  /** The slug chosen when the page opens: the Dono's own. */
  selected: string
}

/** `/exportar`: a Pessoa's Notas as the IMDb CSV, and how to take it to the
 * MovieLens. The form is a plain GET to the download, so the browser saves
 * the file and the page stays; it works before the JavaScript loads.
 * `choices` is null when the engine cannot run on this server. */
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
      <section className="flex flex-col gap-xl rounded-card border border-rule bg-surface p-xl">
        <h1 className="font-display text-title">{EXPORT.title}</h1>
        <p className="text-ink-2">{EXPORT.lead}</p>
        {alert && (
          <p
            role="alert"
            className="flex gap-sm rounded-field border-[1.5px] border-ink px-lg py-2.5 text-ink"
          >
            <span aria-hidden="true">⚠</span>
            <span>{alert}</span>
          </p>
        )}
        {choices && (
          <form
            method="get"
            action="/exportar/imdb.csv"
            className="flex flex-col gap-xl"
          >
            <label className="flex flex-col gap-xs">
              <span className="text-[14px] font-semibold">
                {EXPORT.person}{' '}
                <span className="font-normal text-ink-2">
                  {EXPORT.personHint}
                </span>
              </span>
              <select
                name="pessoa"
                defaultValue={choices.selected}
                className={FIELD}
              >
                {choices.people.map(({ person, name, ratings }) => (
                  <option key={person} value={person}>
                    {EXPORT.option(name, ratings)}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" className="self-start">
              {EXPORT.download}
            </Button>
          </form>
        )}
      </section>
      <section className="flex flex-col gap-sm">
        <h2 className="font-display text-label text-ink-2 uppercase">
          {EXPORT.movielensTitle}
        </h2>
        <ol className="flex list-decimal flex-col gap-xs pl-2xl text-ink-2">
          {EXPORT.movielens.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
    </main>
  )
}
