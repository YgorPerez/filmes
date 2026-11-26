import { createFileRoute } from '@tanstack/react-router'
import { answerFetch } from '#/content/fetch-answer'

// The Dono's "gravar" or "descartar" on a Presente's Perguntas par a par
// posts here (#181). Outside `_owner/`, since the page gate runs for pages,
// not for server handlers: `pairwiseDecisionAction` checks the Dono itself.
export const Route = createFileRoute('/sessoes/$sessao/perguntas')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { servePairwiseDecision } = await import('#/platform/billboard')
        return answerFetch(
          request,
          await servePairwiseDecision(request, params.sessao),
        )
      },
    },
  },
})
