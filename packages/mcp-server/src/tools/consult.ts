import { consult } from '@filmes/engine'
import { z } from 'zod'
import { defineTool } from '../tool.ts'

export default defineTool({
  name: 'consult',
  description:
    'Só para admin. Consulta SQL livre ao banco derivado, só leitura (um SELECT). Devolve {columns, rows}. ' +
    'Escrita é recusada com o erro read_only; SQL que não roda, com invalid_sql. Quem não tem admin: true recebe ' +
    'admin_only. Serve para achar o ID de um filme ou de uma entidade pelo título ou pelo nome (tabelas filmes e entidades).',
  input: z.object({
    sql: z.string().min(1).describe('uma consulta SELECT'),
  }),
  admin: true,
  run: ({ sql }) => consult(sql),
})
