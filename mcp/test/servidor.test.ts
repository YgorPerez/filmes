import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { criarServidor } from "../src/servidor.ts";
import { prepararAmbiente } from "./ambiente.ts";

type Resultado = { isError?: boolean; content: Array<{ type: string; text?: string }> };

function json(resultado: Resultado): any {
  const [bloco] = resultado.content;
  assert.equal(bloco.type, "text");
  return JSON.parse(bloco.text!);
}

describe("servidor MCP sobre a CLI real e a fixture", () => {
  let limpar: () => void;
  let cliente: Client;

  before(async () => {
    limpar = prepararAmbiente();
    const servidor = await criarServidor();
    const [doCliente, doServidor] = InMemoryTransport.createLinkedPair();
    await servidor.connect(doServidor);
    cliente = new Client({ name: "teste", version: "0" });
    await cliente.connect(doCliente);
  });

  // Os testes dividem o repo de dados e o banco: os que registram Feedback mudam a
  // ordem da Recomendação e ficam no fim.
  after(async () => {
    await cliente?.close();
    limpar?.();
  });

  it("expõe recomendar, consultar, registrar_feedback e sessoes_abertas", async () => {
    const { tools } = await cliente.listTools();
    const nomes = tools.map((t) => t.name);
    for (const nome of ["recomendar", "consultar", "registrar_feedback", "sessoes_abertas"]) {
      assert.ok(nomes.includes(nome), nome);
    }
  });

  it("recomendar devolve o top 5 do Dono com Evidências", async () => {
    const resultado = (await cliente.callTool({ name: "recomendar", arguments: { presentes: ["dono"] } })) as Resultado;

    assert.ok(!resultado.isError);
    const saida = json(resultado);
    assert.deepEqual(saida.presentes, ["bruno"]);
    assert.equal(saida.filmes.length, 5);
    assert.equal(saida.filmes[0].titulo, "As Horas Lentas");
    for (const filme of saida.filmes) {
      assert.deepEqual(Object.keys(filme.evidencias), ["bruno"]);
      for (const evidencia of filme.evidencias.bruno) {
        assert.deepEqual(
          Object.keys(evidencia).sort(),
          ["contribuicao", "data", "fato_id", "fonte", "forca", "pessoa", "texto", "tipo"],
        );
      }
    }
  });

  it("recomendar passa a Regra de escolha e agrupa as Evidências por Presente", async () => {
    const resultado = (await cliente.callTool({
      name: "recomendar",
      arguments: { presentes: ["dono", "Iara"], regra: "de", de: "iara" },
    })) as Resultado;

    assert.ok(!resultado.isError);
    const saida = json(resultado);
    assert.deepEqual(saida.regra, { nome: "de", pessoa: "iara" });
    assert.equal(saida.filmes[0].titulo, "Inverno em Lisboa");
    assert.deepEqual(Object.keys(saida.filmes[0].evidencias), ["bruno", "iara"]);
  });

  it("consultar executa SELECT", async () => {
    const resultado = (await cliente.callTool({
      name: "consultar",
      arguments: { sql: "SELECT titulo FROM filmes WHERE id = 'tt9000101'" },
    })) as Resultado;

    assert.ok(!resultado.isError);
    assert.deepEqual(json(resultado), { colunas: ["titulo"], linhas: [["O Farol de Areia"]] });
  });

  it("consultar recusa escrita e devolve o erro da CLI", async () => {
    const resultado = (await cliente.callTool({ name: "consultar", arguments: { sql: "DELETE FROM filmes" } })) as Resultado;

    assert.equal(resultado.isError, true);
    assert.equal(json(resultado).erro.codigo, "somente_leitura");
  });

  it("erro da CLI chega como erro da ferramenta", async () => {
    const resultado = (await cliente.callTool({ name: "recomendar", arguments: { presentes: ["fulano"] } })) as Resultado;

    assert.equal(resultado.isError, true);
    assert.equal(json(resultado).erro.codigo, "pessoa_desconhecida");
  });

  it("entrada inválida é recusada antes de chamar a CLI", async () => {
    const resultado = (await cliente.callTool({ name: "recomendar", arguments: { presentes: [] } })) as Resultado;

    assert.equal(resultado.isError, true);
  });

  it("recomendar abre a Sessão, sessoes_abertas a lista e registrar_feedback a fecha", async () => {
    const pedido = "-- eu e o Teo, qualquer coisa";
    const recomendacao = json(
      (await cliente.callTool({ name: "recomendar", arguments: { presentes: ["dono", "teo"], pedido } })) as Resultado,
    );
    const sessao = recomendacao.sessao.id;
    assert.equal(sessao, "2026-11-20-teo");

    const abertas = json((await cliente.callTool({ name: "sessoes_abertas", arguments: {} })) as Resultado);
    const [aberta] = abertas.sessoes.filter((s: { id: string }) => s.id === sessao);
    assert.equal(aberta.pedido, pedido);

    const resultado = (await cliente.callTool({
      name: "registrar_feedback",
      arguments: {
        sessao,
        filme: recomendacao.filmes[0].titulo,
        notas: [{ pessoa: "dono", nota: 4.5 }],
        relatos: [{ pessoa: "teo", reacao: "não gostou" }],
      },
    })) as Resultado;
    assert.ok(!resultado.isError, JSON.stringify(resultado.content));
    const feedback = json(resultado);
    assert.equal(feedback.escolhido.posicao, 1);
    assert.deepEqual(
      feedback.fatos.filter((f: { texto: string }) => f.texto !== "já viu").map((f: { pessoa: string; tipo: string }) => [f.pessoa, f.tipo]),
      [["bruno", "nota"], ["teo", "relato"]],
    );

    const depois = json((await cliente.callTool({ name: "sessoes_abertas", arguments: {} })) as Resultado);
    assert.ok(!depois.sessoes.some((s: { id: string }) => s.id === sessao));
  });

  it("registrar_feedback fecha com nao vimos nada e recusa filme junto", async () => {
    const recomendacao = json(
      (await cliente.callTool({ name: "recomendar", arguments: { presentes: ["iara"] } })) as Resultado,
    );
    const sessao = recomendacao.sessao.id;

    const ambos = (await cliente.callTool({
      name: "registrar_feedback",
      arguments: { sessao, nada: true, filme: "Vento Norte" },
    })) as Resultado;
    assert.equal(ambos.isError, true);

    const nada = (await cliente.callTool({ name: "registrar_feedback", arguments: { sessao, nada: true } })) as Resultado;
    assert.ok(!nada.isError, JSON.stringify(nada.content));
    assert.equal(json(nada).escolhido, null);
  });
});
