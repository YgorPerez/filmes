import { createFileRoute } from '@tanstack/react-router'

// The evaluation's report as a file (#276). Outside `_owner/`, since the
// page gate runs for pages, not for server handlers: `reportDownload`
// checks the admin Dono itself.
export const Route = createFileRoute('/operacoes/relatorio.md')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { serveReportDownload } = await import('#/platform/operations')
        return serveReportDownload(request)
      },
    },
  },
})
