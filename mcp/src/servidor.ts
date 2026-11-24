// Servidor MCP: registra as ferramentas de src/ferramentas/ e cada uma chama a CLI.
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { chamarCli, type ProgressoCli } from './cli.ts'
import type { Ferramenta } from './ferramenta.ts'

const PASTA_FERRAMENTAS = join(
  dirname(fileURLToPath(import.meta.url)),
  'ferramentas',
)

export async function carregarFerramentas(): Promise<Ferramenta[]> {
  const arquivos = readdirSync(PASTA_FERRAMENTAS)
    .filter((a) => a.endsWith('.ts'))
    .sort()
  const ferramentas: Ferramenta[] = []
  for (const arquivo of arquivos) {
    const modulo = await import(
      pathToFileURL(join(PASTA_FERRAMENTAS, arquivo)).href
    )
    ferramentas.push(modulo.default as Ferramenta)
  }
  return ferramentas
}

export async function criarServidor(): Promise<McpServer> {
  const servidor = new McpServer({ name: 'filmes', version: '0.1.0' })
  for (const ferramenta of await carregarFerramentas()) {
    servidor.registerTool(
      ferramenta.nome,
      { description: ferramenta.descricao, inputSchema: ferramenta.entrada },
      async (entrada: Record<string, unknown>, contexto) => {
        const { comando, args = [], stdin } = ferramenta.cli(entrada as never)
        const progressToken = contexto._meta?.progressToken
        let notificacoes = Promise.resolve()
        const progresso =
          progressToken === undefined
            ? undefined
            : (etapa: ProgressoCli) => {
                notificacoes = notificacoes
                  .then(() =>
                    contexto.sendNotification({
                      method: 'notifications/progress',
                      params: {
                        progressToken,
                        progress: etapa.progresso,
                        total: etapa.total,
                        message: etapa.mensagem,
                      },
                    }),
                  )
                  .catch(() => {})
              }
        const resultado = await chamarCli(comando, args, progresso, stdin)
        await notificacoes
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify(resultado.dados) },
          ],
          isError: !resultado.ok,
        }
      },
    )
  }
  return servidor
}
