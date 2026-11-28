import { deleteSession } from '@filmes/engine'
import { z } from 'zod'
import { defineTool, sessionId } from '../tool.ts'

export default defineTool({
  name: 'delete_session',
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  },
  description:
    'Exclui uma Sessão, aberta ou contada. Só um Dono que esteve entre os Presentes dela exclui; outro recebe `invalid_usage`. ' +
    'Não há desfazer: antes de chamar, pergunte ao Dono e diga o que some. Com Fatos da Sessão (Notas, Já vistos, ' +
    'Declarados, reações), o Dono escolhe em `mode`: `erase` apaga tudo (o arquivo, os Fatos, o Já visto e o Declarado ' +
    'marcados no Cartaz, a Satisfação e o Histórico de apostas); `keep_taste` mantém o gosto (as Notas, os Já vistos e os ' +
    'comentários continuam valendo, com a Sessão como Fonte) e tira a Sessão da lista, da Satisfação e do Histórico de ' +
    'apostas. Sem Fato, a Sessão só some, e `mode` não muda nada. O que já foi para o Trakt fica lá. Devolve `session`.',
  input: z.object({
    session: sessionId(
      'ID da Sessão, como open_sessions ou recommend devolvem',
    ),
    mode: z
      .enum(['keep_taste', 'erase'])
      .describe(
        'a escolha do Dono: keep_taste (manter o gosto) ou erase (apagar tudo)',
      ),
  }),
  run: ({ session, mode }) => deleteSession({ session, mode }),
})
