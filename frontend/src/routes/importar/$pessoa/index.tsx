import { createFileRoute } from '@tanstack/react-router'
import { moved, MOVED_TO } from '#/content/moved'

// A Pessoa's imports moved in the layout pass (#219); the old path redirects.
export const Route = createFileRoute('/importar/$pessoa/')({
  beforeLoad: ({ params, location }) =>
    moved(MOVED_TO.personImports(params.pessoa), location.searchStr),
})
