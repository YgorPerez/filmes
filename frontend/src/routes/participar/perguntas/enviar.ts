import { createFileRoute } from '@tanstack/react-router'
import { answerFetch } from '#/content/fetch-answer'

// The Perguntas par a par's answer posts here (#181). A server handler: the
// parent's link check runs for pages, so `pairwiseAnswerAction` checks the
// link itself. The import is inside the handler, so the browser bundle
// never sees the engine. A post by `fetch` gets `{ to }` (`answerFetch`).
export const Route = createFileRoute('/participar/perguntas/enviar')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { servePairwiseAnswer } = await import('#/platform/billboard')
        return answerFetch(request, await servePairwiseAnswer(request))
      },
    },
  },
})
