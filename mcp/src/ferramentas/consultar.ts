import { z } from 'zod'
import { definirFerramenta } from '../ferramenta.ts'

export default definirFerramenta({
  nome: 'consultar',
  descricao:
    'Consulta SQL livre ao banco, só leitura (SELECT). Devolve {colunas, linhas}. ' +
    'Escrita é recusada com o erro somente_leitura.',
  entrada: {
    sql: z.string().min(1).describe('uma consulta SELECT'),
  },
  cli: ({ sql }) => ({ comando: 'consultar', args: ['--', sql] }),
})
