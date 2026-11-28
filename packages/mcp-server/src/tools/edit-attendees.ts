import { editSessionAttendees } from '@filmes/engine'
import { z } from 'zod'
import { asRequestOwner, defineTool, personName, sessionId } from '../tool.ts'

export default defineTool({
  name: 'edit_attendees',
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: true,
  },
  description:
    'Troca os Presentes de uma Sessão aberta ("a Ana não vem mais", "chegou o Leo") e refaz a Recomendação com Mantidos: ' +
    'os filmes da tela que ainda passam nos Vetos e nas Restrições ficam no número, os que saem estão em `dropped` ' +
    '(com `cause`) e as vagas ganham filme novo com o gosto do grupo novo. Mande a lista inteira, por nome, apelido ou slug; ' +
    '"dono" é o Dono. Só um Dono entre os Presentes atuais edita; outro recebe `invalid_usage`. Devolve o mesmo que `recommend`, ' +
    'com `session.version` nova: depois, chame `billboard`. Para uma Sessão já contada, use `record_feedback` com ' +
    '`correct: true` e os novos `attendees`.',
  input: z.object({
    session: sessionId('ID da Sessão aberta'),
    attendees: z
      .array(personName('Presente'))
      .min(1)
      .describe('os Presentes novos, a lista inteira, ex.: ["dono", "ana"]'),
  }),
  run: ({ session, attendees }) =>
    asRequestOwner(editSessionAttendees(session, attendees)),
})
