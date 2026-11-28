import type { WaitingAnswers } from '@filmes/engine'
import { buttonVariants } from './kit/button-variants'
import type { FormEventHandler } from 'react'
import { PAIRWISE } from './pairwise.copy'

const film = (f: { title: string; year: number | null }) =>
  PAIRWISE.film(f.title, f.year)

/** The Session's page: the Perguntas par a par and the swipe's Vi e
 * gostei / Vi e não gostei (#378) that wait for the Dono, by Presente,
 * each with "gravar" (her yes: they become taste) and "descartar", posted
 * to `/sessoes/<id>/perguntas`. Nothing when none waits. */
export function PairwiseAnswers({
  action,
  waiting,
  post,
}: {
  action: string
  waiting: ReadonlyArray<WaitingAnswers>
  post?: { onSubmit: FormEventHandler<HTMLFormElement>; busy: string | null }
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
      {waiting.map(({ person, name, answers, seen }) => (
        <form
          key={person}
          method="post"
          action={action}
          onSubmit={post?.onSubmit}
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
            {seen.map((g) => (
              <li key={g.film.id}>
                {owner.saw(film(g.film), g.reaction === 'like')}
              </li>
            ))}
          </ul>
          <input type="hidden" name="presente" value={person} />
          <div className="flex flex-wrap gap-sm">
            <button
              type="submit"
              name="decisao"
              disabled={post != null && post.busy !== null}
              value="gravar"
              className={buttonVariants({ variant: 'option' })}
            >
              {owner.record(name)}
            </button>
            <button
              type="submit"
              name="decisao"
              disabled={post != null && post.busy !== null}
              value="descartar"
              className={buttonVariants({ variant: 'link' })}
            >
              {owner.discard}
            </button>
          </div>
        </form>
      ))}
      {post?.busy === 'decisao' && <p role="status">{owner.sending}</p>}
    </section>
  )
}
