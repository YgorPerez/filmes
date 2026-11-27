import { verifyAnswer } from '@filmes/engine'
import { z } from 'zod'
import { defineTool, sessionId } from '../tool.ts'

export default defineTool({
  name: 'verify_answer',
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
  description:
    'Confere a resposta em Markdown antes de mostrá-la. Compara as linhas de Evidência com as da Recomendação ' +
    'gravada na Sessão, por filme e por Presente. Devolve `valid` e `invalidLines`. Use o formato das instruções do servidor.',
  input: z.object({
    session: sessionId('ID da Sessão, o session.id que recommend devolveu'),
    text: z
      .string()
      .min(1)
      .describe('Resposta completa em Markdown, como será enviada ao Dono'),
  }),
  run: verifyAnswer,
})
