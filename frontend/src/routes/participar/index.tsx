import { createFileRoute } from '@tanstack/react-router'
import { votePath } from '#/content/session-votes-address'
import { buttonVariants } from '#/ui/kit/button-variants'
import { PARTICIPATION } from '#/ui/session-link.copy'
import { VOTES } from '#/ui/session-votes.copy'

export const Route = createFileRoute('/participar/')({
  component: SessionLinkFilms,
})

function SessionLinkFilms() {
  const films = Route.useRouteContext().participation?.films ?? []
  const search = Route.useSearch()
  return (
    <section
      aria-labelledby="filmes-da-sessao"
      className="flex flex-col gap-md"
    >
      <h1 id="filmes-da-sessao" className="font-display text-title">
        {PARTICIPATION.films}
      </h1>
      {films.length === 0 ? (
        <p>{PARTICIPATION.empty}</p>
      ) : (
        <ol
          aria-labelledby="filmes-da-sessao"
          className="list-decimal overflow-hidden rounded-card border border-rule bg-surface"
        >
          {films.map((film) => (
            <li
              key={film.id}
              className="ml-3xl border-b border-rule px-sm py-md font-display last:border-b-0"
            >
              {film.title}
            </li>
          ))}
        </ol>
      )}
      {films.length > 0 && (
        <a
          href={votePath('votar', search)}
          className={buttonVariants({
            variant: 'option',
            className: 'self-start',
          })}
        >
          {VOTES.open}
        </a>
      )}
    </section>
  )
}
