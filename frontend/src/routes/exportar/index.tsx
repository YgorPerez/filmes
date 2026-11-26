import { createFileRoute } from '@tanstack/react-router'
import { moved, MOVED_TO } from '#/content/moved'

// The export page is gone: its download is in the Notas section of a
// Pessoa's page (#222). The old path goes to Meu gosto.
export const Route = createFileRoute('/exportar/')({
  beforeLoad: ({ location }) => moved(MOVED_TO.export, location.searchStr),
})
