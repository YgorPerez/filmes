import type { FilmRef } from '@filmes/engine'
import { pairwisePath } from '#/content/pairwise-address'
import type { PairwisePage } from '#/platform/pairwise'
import { buttonVariants } from './kit/button-variants'
import { Alert, Notice } from './kit/status'
import { PAIRWISE } from './pairwise.copy'

/** The link's address, carried by the answer's form. */
export type PairwiseLink = { session: string; token: string; person: string }

const choice = buttonVariants({
  variant: 'option',
  className: 'min-h-[64px] w-full justify-start text-left',
})

function Choice({ film }: { film: FilmRef }) {
  return (
    <button type="submit" name="escolha" value={film.id} className={choice}>
      {PAIRWISE.film(film.title, film.year)}
    </button>
  )
}

/** `/participar/perguntas`: one pair at a time, as a plain form to
 * `/participar/perguntas/enviar` (it works before the JavaScript). `page`
 * is null when the engine could not ask; `failed` says the last answer was
 * not kept. */
export function PairwiseQuestion({
  page,
  link,
  failed = false,
  back,
}: {
  page: PairwisePage | null
  link: PairwiseLink
  failed?: boolean
  back: string
}) {
  const pair = page?.pair ?? null
  return (
    <section aria-labelledby="pergunta" className="flex flex-col gap-lg">
      <h1 id="pergunta" className="font-display text-title">
        {PAIRWISE.title}
      </h1>
      {page === null ? (
        <Alert>{PAIRWISE.unavailable}</Alert>
      ) : pair === null ? (
        <Notice>{page.answered > 0 ? PAIRWISE.done : PAIRWISE.none}</Notice>
      ) : (
        <>
          <p className="text-ink-2">{PAIRWISE.lead}</p>
          {failed && <Alert>{PAIRWISE.failed}</Alert>}
          <form
            method="post"
            action="/participar/perguntas/enviar"
            aria-label={PAIRWISE.title}
            className="flex flex-col gap-md"
          >
            <p className="text-meta text-ink-2 tabular-nums">
              {PAIRWISE.progress(page.answered + 1, page.total)}
            </p>
            <input type="hidden" name="sessao" value={link.session} />
            <input type="hidden" name="chave" value={link.token} />
            <input type="hidden" name="presente" value={link.person} />
            <input type="hidden" name="a" value={pair[0].id} />
            <input type="hidden" name="b" value={pair[1].id} />
            <Choice film={pair[0]} />
            <Choice film={pair[1]} />
            <button
              type="submit"
              name="escolha"
              value=""
              className={buttonVariants({ variant: 'link' })}
            >
              {PAIRWISE.skip}
            </button>
          </form>
        </>
      )}
      <a href={back} className={buttonVariants({ variant: 'link' })}>
        {PAIRWISE.back}
      </a>
    </section>
  )
}

/** On the link's film list: the way to the questions. */
export function PairwiseInvite({
  session,
  token,
  person,
}: {
  session: string
  token: string
  person: string
}) {
  return (
    <a
      href={pairwisePath(session, token, person)}
      className={buttonVariants({ variant: 'option', className: 'self-start' })}
    >
      {PAIRWISE.invite}
    </a>
  )
}
