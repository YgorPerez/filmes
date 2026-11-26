import { createFileRoute } from '@tanstack/react-router'
import { PairwiseInvite } from '#/ui/pairwise'
import { PARTICIPATION } from '#/ui/session-link.copy'

export const Route = createFileRoute('/participar/')({
  component: SessionLinkFilms,
})

function SessionLinkFilms() {
  const { participation } = Route.useRouteContext()
  const { chave } = Route.useSearch()
  const films = participation?.films ?? []
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
      {participation?.selected && chave && (
        <PairwiseInvite
          session={participation.session}
          token={chave}
          person={participation.selected.person}
        />
      )}
    </section>
  )
}
