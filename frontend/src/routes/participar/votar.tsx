import { createFileRoute } from '@tanstack/react-router'
import { readVoteDeck } from '#/content/session-votes'
import { votePath, voteSearch } from '#/content/session-votes-address'
import { sessionLinkPath } from '#/content/session-link-address'
import { buttonVariants } from '#/ui/kit/button-variants'
import { Alert, Notice } from '#/ui/kit/status'
import { VOTES } from '#/ui/session-votes.copy'
import { VoteCards } from '#/ui/session-votes'

// The group swipe (#182): the chosen Presente votes on the films of the
// screen she has not voted on yet.
export const Route = createFileRoute('/participar/votar')({
  validateSearch: voteSearch,
  loaderDeps: ({ search: { sessao, chave, presente, feito, erro } }) => ({
    sessao,
    chave,
    presente,
    feito,
    erro,
  }),
  loader: ({ deps: { sessao, chave, presente } }) =>
    readVoteDeck({ data: { sessao, chave, presente } }),
  component: VoteRoute,
})

function VoteRoute() {
  const deck = Route.useLoaderData()
  const search = Route.useSearch()
  const { sessao, chave, presente, feito, erro } = search
  const list = sessao && chave ? sessionLinkPath(sessao, chave, presente) : null
  return (
    <section aria-labelledby="votar" className="flex flex-col gap-lg">
      <h1 id="votar" className="font-display text-title">
        {VOTES.title}
      </h1>
      {feito && <Notice>{VOTES.notices[feito]}</Notice>}
      {erro && <Alert>{VOTES.refusals[erro]}</Alert>}
      {deck && deck.films.length > 0 ? (
        <VoteCards
          key={`${deck.version}:${deck.films.map((f) => f.id).join(',')}`}
          deck={deck}
          action={votePath('votos', search)}
        />
      ) : (
        <>
          <p>{VOTES.done}</p>
          <div className="flex flex-wrap gap-sm">
            <a
              href={votePath('votar', search)}
              className={buttonVariants({ variant: 'option' })}
            >
              {VOTES.refresh}
            </a>
            {list && (
              <a href={list} className={buttonVariants({ variant: 'option' })}>
                {VOTES.list}
              </a>
            )}
          </div>
        </>
      )}
    </section>
  )
}
