import { useEffect, useRef } from 'react'
import type { PairFilm, PairwisePage } from '#/platform/pairwise'
import { GroupPickQuestion } from './group-pick'
import { buttonVariants } from './kit/button-variants'
import { PostForm } from './kit/post-form'
import { Alert } from './kit/status'
import { PAIRWISE } from './pairwise.copy'
import { FilmCover } from './session-link'

/** The link's address, carried by the answer's form. */
export type PairwiseLink = { session: string; token: string; person: string }

/** One of the pair: its tape and, under it, the title and year; a tap on
 * either chooses it. The poster is decorative, so the button's name is the
 * title. */
function Choice({ film, busy }: { film: PairFilm; busy: boolean }) {
  return (
    <button
      type="submit"
      name="escolha"
      value={film.id}
      disabled={busy}
      className="flex min-h-[64px] cursor-pointer flex-col items-stretch gap-sm rounded-card border-(length:--border-width-stroke) border-rule bg-surface p-sm text-left font-display text-control text-ink hover:border-ink disabled:cursor-default disabled:opacity-60"
    >
      <FilmCover
        poster={film.poster}
        title={film.title}
        eager
        className="w-full"
      />
      <span className="text-balance">
        {PAIRWISE.film(film.title, film.year)}
      </span>
    </button>
  )
}

/** `/participar/perguntas`: the groups to pick first, when she has them
 * (`GroupPickQuestion`, #415); then one pair at a time, as a plain form to
 * `/participar/perguntas/enviar` (it works before the JavaScript; with it,
 * the answer goes by `fetch` and the next pair comes without a reload,
 * #240). After each answer the focus goes to the question's count, which a
 * screen reader hears; once she is done, to the thanks. `page` is null when
 * the engine could not ask; `failed` says the last answer was not kept. */
export function PairwiseQuestion({
  page,
  link,
  failed = false,
  back,
  owner = null,
}: {
  page: PairwisePage | null
  link: PairwiseLink
  failed?: boolean
  back: string
  /** Who opened the Session: she decides whether the answers become
   * taste. */
  owner?: string | null
}) {
  const pair = page?.pair ?? null
  const progress = useRef<HTMLParagraphElement>(null)
  const thanks = useRef<HTMLHeadingElement>(null)
  const answered = page?.answered ?? 0
  const first = useRef(answered)
  useEffect(() => {
    // Only after an answer, not when the page opens.
    if (answered === first.current) return
    if (pair) progress.current?.focus()
    else thanks.current?.focus()
  }, [answered, pair])
  if (page?.groups)
    return (
      <GroupPickQuestion
        groups={page.groups}
        link={link}
        failed={failed}
        back={back}
        owner={owner}
      />
    )
  if (page !== null && pair === null) {
    const done = page.answered > 0
    return (
      <section aria-labelledby="pergunta" className="flex flex-col gap-lg">
        <h1
          id="pergunta"
          ref={thanks}
          tabIndex={-1}
          className="font-display text-page-title text-balance"
        >
          {done ? PAIRWISE.doneTitle : PAIRWISE.noneTitle}
        </h1>
        <p role="status" className="max-w-[60ch] text-pretty text-ink-2">
          {done ? PAIRWISE.done(owner) : PAIRWISE.none}
        </p>
        <a href={back} className={buttonVariants({ className: 'self-start' })}>
          {PAIRWISE.back}
        </a>
      </section>
    )
  }
  return (
    <section aria-labelledby="pergunta" className="flex flex-col gap-lg">
      <h1 id="pergunta" className="font-display text-page-title text-balance">
        {PAIRWISE.title}
      </h1>
      {page === null || pair === null ? (
        <Alert>{PAIRWISE.unavailable}</Alert>
      ) : (
        <>
          <p className="max-w-[60ch] text-pretty text-ink-2">
            {PAIRWISE.lead(owner)}
          </p>
          {failed && <Alert>{PAIRWISE.failed}</Alert>}
          <PostForm
            action="/participar/perguntas/enviar"
            label={PAIRWISE.title}
            className="flex flex-col gap-md"
          >
            {(busy) => (
              <>
                <div className="flex flex-wrap items-baseline gap-x-sm text-meta text-ink-2">
                  <p
                    ref={progress}
                    tabIndex={-1}
                    aria-live="polite"
                    className="font-bold text-ink tabular-nums"
                  >
                    {PAIRWISE.progress(page.answered + 1, page.total)}
                  </p>
                  <p>{PAIRWISE.canStop}</p>
                </div>
                <input type="hidden" name="sessao" value={link.session} />
                <input type="hidden" name="chave" value={link.token} />
                <input type="hidden" name="presente" value={link.person} />
                <input type="hidden" name="a" value={pair[0].id} />
                <input type="hidden" name="b" value={pair[1].id} />
                <div className="grid grid-cols-2 gap-md min-[560px]:max-w-[440px]">
                  <Choice film={pair[0]} busy={busy} />
                  <Choice film={pair[1]} busy={busy} />
                </div>
                <button
                  type="submit"
                  name="escolha"
                  value=""
                  disabled={busy}
                  className={buttonVariants({
                    variant: 'option',
                    className: 'self-start',
                  })}
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
