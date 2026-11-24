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

describe('ferramenta pessoa', () => {
  let limpar: () => void
  let cliente: Client

  async function pessoa(args: Record<string, unknown>): Promise<Resultado> {
    return (await cliente.callTool({
      name: 'pessoa',
      arguments: args,
    })) as Resultado
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

  it('cria, declara, relata, veta e mostra a Pessoa', async () => {
    assert.ok(
      !(
        await pessoa({
          acao: 'criar',
          nome: 'Ana',
          slug: 'ana',
          apelidos: ['Aninha'],
        })
      ).isError,
    )
    const declarado = await pessoa({
      acao: 'declarar',
      pessoa: 'ana',
      texto: 'adoro a Sofia Rangel',
      entidade: 'Q9000018',
      reacao: 'gosta',
      fonte: 'questionário',
    })
    assert.equal(json(declarado).declarado.forca, 'forte')
    const relato = await pessoa({
      acao: 'relatar',
      pessoa: 'ana',
      texto: '-- odeia filme lento',
    })
    assert.equal(json(relato).relato.texto, '-- odeia filme lento')
    assert.ok(
      !(
        await pessoa({
          acao: 'vetar',
          pessoa: 'ana',
          texto: 'nunca vê terror',
          entidade: 'Q9001801',
        })
      ).isError,
    )

    const saida = json(await pessoa({ acao: 'ver', pessoa: 'Aninha' }))

    assert.equal(saida.pessoa, 'ana')
    assert.equal(saida.declarados.length, 1)
    assert.equal(saida.relatos.length, 1)
    assert.deepEqual(
      saida.vetos.map((v: any) => v.rotulo),
      ['Terror'],
    )
  })

  it('veta um grupo de tags', async () => {
    const veto = json(
      await pessoa({
        acao: 'vetar',
        pessoa: 'ana',
        texto: 'não quer comédia boba',
        grupo: 'comedia_boba',
      }),
    )
    assert.deepEqual(
      [veto.veto.alvo, veto.veto.rotulo],
      ['comedia_boba', 'comédia boba'],
    )
    assert.ok(
      !(await pessoa({ acao: 'remover', pessoa: 'ana', veto: 'comedia_boba' }))
        .isError,
    )
  })

  it('grava e desfaz um Ajuste', async () => {
    const ajuste = json(
      await pessoa({
        acao: 'ajustar',
        pessoa: 'ana',
        elo: 'elenco',
        nivel: 'nada',
      }),
    )
    assert.deepEqual(
      [ajuste.ajuste.elo, ajuste.ajuste.nivel, ajuste.novo],
      ['elenco', 'nada', true],
    )
    assert.deepEqual(
      json(await pessoa({ acao: 'ver', pessoa: 'ana' })).ajustes.map(
        (a: any) => a.nivel,
      ),
      ['nada'],
    )

    assert.ok(
      !(
        await pessoa({
          acao: 'ajustar',
          pessoa: 'ana',
          elo: 'elenco',
          nivel: 'normal',
        })
      ).isError,
    )
    assert.deepEqual(
      json(await pessoa({ acao: 'ver', pessoa: 'ana' })).ajustes,
      [],
    )
    assert.ok(
      (await pessoa({ acao: 'ajustar', pessoa: 'ana', elo: 'elenco' })).isError,
    )
  })

  it('guarda, lista e tira perguntas abertas; pulada duas vezes, sai', async () => {
    const pulada = json(
      await pessoa({
        acao: 'pular',
        pessoa: 'ana',
        texto: 'a Ana curte a Helena Prado?',
        entidade: 'Q9000001',
      }),
    )
    assert.deepEqual(
      [pulada.pergunta.rotulo, pulada.pergunta.puladas, pulada.saiu],
      ['Helena Prado', 1, false],
    )
    const outra = json(
      await pessoa({
        acao: 'pular',
        pessoa: 'ana',
        texto: '-- topa comédia boba?',
        grupo: 'comedia_boba',
      }),
    )
    assert.equal(outra.pergunta.texto, '-- topa comédia boba?')

    const abertas = json(
      await pessoa({ acao: 'perguntas', pessoa: 'ana' }),
    ).perguntas_abertas
    assert.deepEqual(
      abertas.map((p: any) => p.assunto),
      ['Q9000001', 'comedia_boba'],
    )

    const de_novo = json(
      await pessoa({
        acao: 'pular',
        pessoa: 'ana',
        texto: 'e a Helena Prado?',
        entidade: 'Q9000001',
      }),
    )
    assert.deepEqual([de_novo.pergunta.puladas, de_novo.saiu], [2, true])
    assert.ok(
      !(
        await pessoa({
          acao: 'remover',
          pessoa: 'ana',
          pergunta: 'comedia_boba',
        })
      ).isError,
    )
    assert.deepEqual(
      json(await pessoa({ acao: 'perguntas', pessoa: 'ana' }))
        .perguntas_abertas,
      [],
    )
    assert.ok((await pessoa({ acao: 'pular', pessoa: 'ana' })).isError)
  })

  it('o Veto age na Recomendação', async () => {
    const resultado = (await cliente.callTool({
      name: 'recomendar',
      arguments: { presentes: ['dono', 'ana'], quantos: 50 },
    })) as Resultado

    assert.deepEqual(
      json(resultado).vetos.map((v: any) => v.pessoa),
      ['ana'],
    )
  })

  it('registra Já visto com Nota de 1 a 10 e o filme sai com sem Já visto', async () => {
    const visto = json(
      await pessoa({
        acao: 'visto',
        pessoa: 'teo',
        filme: 'tt9000601',
        nota: '8/10',
      }),
    )
    assert.equal(visto.visto.nota, 4)

    const resultado = (await cliente.callTool({
      name: 'recomendar',
      arguments: { presentes: ['teo'], quantos: 50, sem_ja_visto: true },
    })) as Resultado

    assert.ok(!json(resultado).filmes.some((f: any) => f.id === 'tt9000601'))
  })

  it('ação sem o que ela precisa é recusada', async () => {
    assert.equal((await pessoa({ acao: 'visto', pessoa: 'teo' })).isError, true)
    assert.equal(
      (await pessoa({ acao: 'vetar', pessoa: 'ana', texto: 'nunca vê terror' }))
        .isError,
      true,
    )
    assert.equal((await pessoa({ acao: 'ver' })).isError, true)
  })
})
