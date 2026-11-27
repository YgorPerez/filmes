import { createFileRoute } from '@tanstack/react-router'
import { filmParam, searchFor, searchParam } from '#/content/catalog-search'
import { isRatingRefusal, writtenCount } from '#/content/rating-form'
import { readFilmCard, readMyRatings, readRatingQueue } from '#/content/ratings'
import { RatingScreen } from '#/ui/ratings'

export const Route = createFileRoute('/_owner/meu-gosto/notas')({
  validateSearch: (search) => ({
    feito: writtenCount(search.feito),
    erro: isRatingRefusal(search.erro) ? search.erro : undefined,
    buscar: searchParam(search.buscar),
    filme: filmParam(search.filme),
  }),
  loaderDeps: ({ search }) => ({ buscar: search.buscar, filme: search.filme }),
  loader: async ({ deps }) => {
    const [queue, search, picked] = await Promise.all([
      readRatingQueue(),
      searchFor(deps.buscar, 'films'),
      // "Mudar" on Meu gosto opens a film no search found (#274).
      deps.filme ? readFilmCard({ data: { id: deps.filme } }) : null,
    ])
    const found = search && 'found' in search ? search.found.films : []
    const ids = [...found.map((f) => f.id), ...(deps.filme ? [deps.filme] : [])]
    // Her Notas of those films: "sua nota 9" before she rates one again.
    const rated = ids.length > 0 ? await readMyRatings({ data: { ids } }) : {}
    return { queue, search, picked, rated }
  },
  component: RatingRoute,
})

/** The card of the film on screen, asked as it comes up. */
const loadCard = (id: string) => readFilmCard({ data: { id } })

function RatingRoute() {
  const { feito, erro, filme } = Route.useSearch()
  const { queue, search, picked, rated } = Route.useLoaderData()
  return (
    <RatingScreen
      queue={queue}
      search={search}
      film={filme}
      picked={picked}
      rated={rated}
      written={feito}
      refusal={erro}
      loadCard={loadCard}
    />
  )
}
