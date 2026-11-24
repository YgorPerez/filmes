import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, it } from 'vite-plus/test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { criarServidor } from '../src/servidor.ts'
import { prepararAmbiente } from './ambiente.ts'

type Resultado = {
  isError?: boolean
  content: Array<{ type: string; text?: string }>
}

function json(resultado: Resultado): any {
  const [bloco] = resultado.content
  assert.equal(bloco.type, 'text')
  return JSON.parse(bloco.text!)
}

describe('responder_cartaz lê o texto colado do cartaz', () => {
  let limpar: () => void
  let cliente: Client

  async function chamar(
    name: string,
    args: Record<string, unknown>,
  ): Promise<Resultado> {
    return (await cliente.callTool({ name, arguments: args })) as Resultado
  }

  beforeAll(async () => {
    limpar = prepararAmbiente()
    const servidor = await criarServidor()
    const [doCliente, doServidor] = InMemoryTransport.createLinkedPair()
    await servidor.connect(doServidor)
    cliente = new Client({ name: 'teste', version: '0' })
    await cliente.connect(doCliente)
  })

  afterAll(async () => {
    await cliente?.close()
    limpar?.()
  })

  it('grava o Já vi com nota e devolve o pedido de regerar', async () => {
    const recomendacao = json(
      await chamar('recomendar', { presentes: ['dono', 'iara'] }),
    )
    const sessao = recomendacao.sessao.id
    const [a, b, c] = recomendacao.filmes.map((f: { id: string }) => f.id)
    const texto =
      `Marquei aqui:\n#cartaz ${sessao} v1\nacrescentar: --algo leve\n` +
      `1 ${a} · já vi: iara=8\n2 ${b} · trocar\n3 ${c} · estrelas: 4 · comentário: -- bom\n`

    const resultado = await chamar('responder_cartaz', { sessao, texto })

    assert.ok(!resultado.isError, JSON.stringify(resultado.content))
    const saida = json(resultado)
    assert.equal(saida.regerar, true)
    assert.deepEqual(
      saida.saem.map((s: { id: string; motivo: string }) => [s.id, s.motivo]),
      [
        [a, 'ja_visto'],
        [b, 'trocado'],
      ],
    )
    assert.ok(!saida.manter.includes(a) && saida.manter.includes(c))
    assert.equal(saida.acrescentar, '--algo leve')
    assert.deepEqual(
      saida.comentarios.map((x: { comentario: string }) => x.comentario),
      ['-- bom'],
    )
    const iara = json(await chamar('pessoa', { acao: 'ver', pessoa: 'iara' }))
    assert.ok(
      iara.vistos.some(
        (v: { filme: string; nota: number }) => v.filme === a && v.nota === 4,
      ),
    )
  })

  it('texto que não é de cartaz é erro de uso', async () => {
    const sessao = json(await chamar('recomendar', { presentes: ['dono'] }))
      .sessao.id

    const resultado = await chamar('responder_cartaz', { sessao, texto: 'oi' })

    assert.ok(resultado.isError)
    assert.equal(json(resultado).erro.codigo, 'uso_invalido')
  })

  it('filho que sai sem ler o stdin vira erro, sem derrubar o servidor', async () => {
    const python = process.env.FILMES_PYTHON
    process.env.FILMES_PYTHON = '/bin/true'
    try {
      const resultado = await chamar('responder_cartaz', {
        sessao: 'x',
        texto: '#cartaz x v1\n'.repeat(1_000_000),
      })

      assert.ok(resultado.isError)
      assert.equal(json(resultado).erro.codigo, 'cli_sem_json')
    } finally {
      if (python === undefined) delete process.env.FILMES_PYTHON
      else process.env.FILMES_PYTHON = python
    }
    const sessao = json(await chamar('recomendar', { presentes: ['dono'] }))
      .sessao.id
    assert.ok(sessao)
  })
})
