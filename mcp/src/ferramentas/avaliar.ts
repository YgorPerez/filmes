import { z } from 'zod'
import { definirFerramenta } from '../ferramenta.ts'

export default definirFerramenta({
  nome: 'avaliar',
  descricao:
    'Mede recall@50, cobertura no top 5 e o Feedback das últimas dez Sessões. ' +
    'Grava um relatório datado em docs/avaliacoes.',
  entrada: {
    grade: z
      .boolean()
      .optional()
      .describe('Compara os pesos e mostra os três melhores conjuntos'),
  },
  cli: ({ grade }) => ({
    comando: 'avaliar',
    args: grade ? ['--grade', '--progresso'] : ['--progresso'],
  }),
})
