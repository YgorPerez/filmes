import { evaluate } from '@filmes/engine'
import { z } from 'zod'
import { defineTool } from '../tool.ts'

export default defineTool({
  name: 'evaluate',
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  },
  description:
    'Só para admin. Mede a Recomendação: recall@50 e cobertura no top 5 sobre as Notas guardadas de fora (offline, ' +
    'das Pessoas e de uma amostra do MovieLens), com a calibração da Força, o erro da nota prevista (ausente por ora) ' +
    'e a parecença média do top 5; e o Feedback das últimas dez Sessões (online), com a satisfação de cada Presente e a ' +
    'discordância. Grava um relatório datado ' +
    'na pasta de avaliações (FILMES_AVALIACOES) e devolve as medidas, os avisos e o caminho do relatório. O resto segue ' +
    'gravando enquanto mede. Demora (minutos com o MovieLens inteiro): manda ' +
    'notificações de progresso de 0 a 100. Quem não tem admin: true recebe admin_only.',
  input: z.object({
    grid: z
      .boolean()
      .optional()
      .describe(
        'compara também os pesos da grade e devolve os três melhores conjuntos',
      ),
  }),
  admin: true,
  run: ({ grid }, { progress }) =>
    evaluate({ grid: grid ?? false, onProgress: progress }),
})
