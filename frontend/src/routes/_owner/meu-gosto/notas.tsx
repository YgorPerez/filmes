import { createFileRoute } from '@tanstack/react-router'
import { filmParam, searchFor, searchParam } from '#/content/catalog-search'
import { isRatingRefusal, writtenCount } from '#/content/rating-form'
import { readFilmCard, readRatingQueue } from '#/content/ratings'
import { RatingScreen } from '#/ui/ratings'

export const Route = createFileRoute('/_owner/meu-gosto/notas')({
  validateSearch: (search) => ({
    feito: writtenCount(search.feito),
    erro: isRatingRefusal(search.erro) ? search.erro : undefined,
    buscar: searchParam(search.buscar),
    filme: filmParam(search.filme),
  }),
  loaderDeps: ({ search }) => ({ buscar: search.buscar }),
  loader: async ({ deps }) => {
    const [queue, search] = await Promise.all([
      readRatingQueue(),
      searchFor(deps.buscar, 'films'),
    ])
    return { queue, search }
  },
  component: RatingRoute,
})

/** The card of the film on screen, asked as it comes up. */
const loadCard = (id: string) => readFilmCard({ data: { id } })

function RatingRoute() {
  const { feito, erro, filme } = Route.useSearch()
  const { queue, search } = Route.useLoaderData()
  return (
    <RatingScreen
      queue={queue}
      search={search}
      film={filme}
      written={feito}
      refusal={erro}
      loadCard={loadCard}
    />
  )
}
