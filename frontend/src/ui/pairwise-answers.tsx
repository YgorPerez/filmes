import type { WaitingAnswers } from '@filmes/engine'
import { buttonVariants } from './kit/button-variants'
import { PAIRWISE } from './pairwise.copy'

const film = (f: { title: string; year: number | null }) =>
  PAIRWISE.film(f.title, f.year)

/** The Session's page: the Perguntas par a par that wait for the Dono, by
 * Presente, each with "gravar" (her yes: they become taste) and
 * "descartar", posted to `/sessoes/<id>/perguntas`. Nothing when none
 * waits. */
export function PairwiseAnswers({
  action,
  waiting,
}: {
  action: string
  waiting: ReadonlyArray<WaitingAnswers>
}) {
  const { owner } = PAIRWISE
  if (waiting.length === 0) return null
  return (
    <section
      aria-labelledby="perguntas-par-a-par"
      className="flex flex-col gap-lg rounded-card border border-rule bg-surface p-xl"
    >
      <h2 id="perguntas-par-a-par" className="font-display text-step-title">
        {owner.title}
      </h2>
      <p className="text-ink-2">{owner.lead}</p>
      {waiting.map(({ person, name, answers }) => (
        <form
          key={person}
          method="post"
          action={action}
          aria-label={name}
          className="flex flex-col gap-sm"
        >
          <h3 className="font-display font-bold">{name}</h3>
          <ul className="list-disc pl-5">
            {answers.map((a) => (
              <li key={`${a.chosen.id}-${a.other.id}`}>
                {owner.prefers(film(a.chosen), film(a.other))}
              </li>
            ))}
          </ul>
          <input type="hidden" name="presente" value={person} />
          <div className="flex flex-wrap gap-sm">
            <button
              type="submit"
              name="decisao"
              value="gravar"
              className={buttonVariants({ variant: 'option' })}
            >
              {owner.record(name)}
            </button>
            <button
              type="submit"
              name="decisao"
              value="descartar"
              className={buttonVariants({ variant: 'link' })}
            >
              {owner.discard}
            </button>
          </div>
        </form>
      ))}
    </section>
  )
}
