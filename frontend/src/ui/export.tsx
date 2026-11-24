import type { ExportRefusal } from '#/content/export-refusal'
import { EXPORT } from './export.copy'
import { Marquee } from './marquee'
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
    <main className="mx-auto flex max-w-[720px] flex-col gap-xl px-lg py-xl">
      <header className="flex flex-wrap items-center justify-between gap-md">
        <Marquee words={['filmes']} />
        <a href="/" className={buttonVariants({ variant: 'quiet' })}>
          {EXPORT.back}
        </a>
      </header>
      <section className="flex flex-col gap-md rounded-card border border-rule bg-surface p-md">
        <h1 className="text-title">{EXPORT.title}</h1>
        <p className="text-ink-2">{EXPORT.lead}</p>
        {alert && (
          <p
            role="alert"
            className="flex gap-sm rounded-field border border-marquee-red-text px-3 py-2.5 text-marquee-red-text"
          >
            <span aria-hidden="true">⚠</span>
            <span>{alert}</span>
          </p>
        )}
        {choices && (
          <form
            method="get"
            action="/exportar/imdb.csv"
            className="flex flex-col gap-md"
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
                className="min-h-touch rounded-field border border-rule bg-surface px-3 py-[9px] text-[15px] text-ink"
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
        <h2 className="text-label text-ink-2 uppercase">
          {EXPORT.movielensTitle}
        </h2>
        <ol className="flex list-decimal flex-col gap-xs pl-lg text-ink-2">
          {EXPORT.movielens.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
    </main>
  )
}
