import { editSessionRequest } from '@filmes/engine'
import { asRequestOwner, defineTool, sessionId } from '../tool.ts'
import recommend from './recommend.ts'

/** The request's fields, described as `recommend` describes them. */
const fields = recommend.input.pick({
  request: true,
  count: true,
  maxDuration: true,
  since: true,
  until: true,
  language: true,
  child: true,
  childAge: true,
  triggers: true,
  unseen: true,
  noSad: true,
  noSlow: true,
  noMoods: true,
  similar: true,
  seriesOrder: true,
})

export default defineTool({
  name: 'edit_session_request',
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: true,
  },
  description:
    'Edita o pedido e as Restrições de uma Sessão aberta e refaz a Recomendação com Mantidos: os filmes da tela que ' +
    'ainda passam ficam no número, os que uma Restrição ou um Veto novos tiram saem em `dropped` e as vagas ganham filme ' +
    'novo; Climas novos ou um parecido novo trocam a lista inteira. A edição substitui o pedido: mande-o inteiro, com o que ' +
    'continua valendo, porque o campo que falta é Restrição tirada (o parecido e a Série na ordem também; `moods: []` tira os ' +
    'Climas). `count` muda o tamanho da lista; sem ele, fica o da versão atual. Os Presentes e a Regra ficam os da versão ' +
    'atual; para mudar os Presentes, use `edit_attendees`. ' +
    'Sessão já contada responde `closed_session`, e só um Dono entre os Presentes edita. Devolve o mesmo que `recommend`, ' +
    'com `session.version` nova: depois, chame `billboard`.',
  input: fields.extend({
    session: sessionId('ID da Sessão aberta'),
    moods: recommend.input.shape.moods.unwrap(),
  }),
  run: ({ session, child, childAge, ...edit }) =>
    asRequestOwner(
      editSessionRequest(session, {
        ...edit,
        ...(childAge !== undefined
          ? { child: childAge }
          : child
            ? { child: 0 }
            : {}),
      }),
    ),
})
