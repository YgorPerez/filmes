import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { it } from 'vite-plus/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { criarServidor } from '../src/servidor.ts'
import { prepararAmbiente } from './ambiente.ts'

it('entrega o relatório da avaliação e notifica o progresso pelo MCP', async () => {
  const limpar = prepararAmbiente()
  const cliente = new Client({ name: 'teste', version: '0' })
  try {
    process.env.FILMES_AVALIACOES = join(
      process.env.FILMES_DADOS!,
      'avaliacoes',
    )
    const [doCliente, doServidor] = InMemoryTransport.createLinkedPair()
    await (await criarServidor()).connect(doServidor)
    await cliente.connect(doCliente)

    const etapas: number[] = []
    const resultado = await cliente.callTool(
      { name: 'avaliar', arguments: { grade: true } },
      undefined,
      {
        onprogress: ({ progress }) => etapas.push(progress),
      },
    )
    assert.equal(resultado.isError, false)
    assert.equal(etapas[0], 0)
    assert.ok(etapas.length > 2)
    assert.equal(etapas.at(-1), 100)
    assert.ok(etapas.slice(1).every((valor, indice) => valor > etapas[indice]))
    const [bloco] = resultado.content as Array<{ text: string }>
    const avaliacao = JSON.parse(bloco.text)
    assert.equal(avaliacao.offline.pessoas.retidos_4_mais, 5)
    assert.equal(avaliacao.grade.melhores.length, 3)
    assert.ok(existsSync(avaliacao.arquivo))
  } finally {
    await cliente.close()
    limpar()
  }
})
