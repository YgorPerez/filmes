import { openSessions } from '@filmes/engine'
import { z } from 'zod'
import { defineTool } from '../tool.ts'

export default defineTool({
  name: 'open_sessions',
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
  description:
    'Lista as Sessões sem Feedback, a mais recente primeiro, em `sessions`: id, date, attendees (os Presentes), ' +
    'request (o pedido) e recommendation ({position, id, title}) da versão atual, e `version`, que passa de 1 quando a ' +
    'Recomendação foi refeita. Antes de recomendar, pergunte ao Dono pela Sessão aberta, em uma linha.',
  input: z.object({}),
  run: () => openSessions,
})
