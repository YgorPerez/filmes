import type { FilmRef } from '@filmes/engine'
import { pairwisePath } from '#/content/pairwise-address'
import type { PairwisePage } from '#/platform/pairwise'
import { buttonVariants } from './kit/button-variants'
import { PostForm } from './kit/post-form'
import { Alert, Notice } from './kit/status'
import { PAIRWISE } from './pairwise.copy'

/** The link's address, carried by the answer's form. */
export type PairwiseLink = { session: string; token: string; person: string }

const choice = buttonVariants({
  variant: 'option',
  className: 'min-h-[64px] w-full justify-start text-left',
})

function Choice({ film, busy }: { film: FilmRef; busy: boolean }) {
  return (
    <button
      type="submit"
      name="escolha"
      value={film.id}
      disabled={busy}
      className={choice}
    >
      {PAIRWISE.film(film.title, film.year)}
    </button>
  )
}

/** `/participar/perguntas`: one pair at a time, as a plain form to
 * `/participar/perguntas/enviar` (it works before the JavaScript; with it,
 * the answer goes by `fetch` and the next pair comes without a reload,
 * #240). `page`
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
          <PostForm
            action="/participar/perguntas/enviar"
            label={PAIRWISE.title}
            className="flex flex-col gap-md"
          >
            {(busy) => (
              <>
                <p className="text-meta text-ink-2 tabular-nums">
                  {PAIRWISE.progress(page.answered + 1, page.total)}
                </p>
                <input type="hidden" name="sessao" value={link.session} />
                <input type="hidden" name="chave" value={link.token} />
                <input type="hidden" name="presente" value={link.person} />
                <input type="hidden" name="a" value={pair[0].id} />
                <input type="hidden" name="b" value={pair[1].id} />
                <Choice film={pair[0]} busy={busy} />
                <Choice film={pair[1]} busy={busy} />
                <button
                  type="submit"
                  name="escolha"
                  value=""
                  disabled={busy}
                  className={buttonVariants({ variant: 'link' })}
                >
                  {PAIRWISE.skip}
                </button>
              </>
            )}
          </PostForm>
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
