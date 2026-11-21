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

  after(async () => {
    await cliente?.close();
    limpar?.();
  });

  it("expõe recomendar e consultar", async () => {
    const { tools } = await cliente.listTools();
    const nomes = tools.map((t) => t.name);
    assert.ok(nomes.includes("recomendar"));
    assert.ok(nomes.includes("consultar"));
  });

  it("recomendar devolve o top 5 do Dono com Evidências", async () => {
    const resultado = (await cliente.callTool({ name: "recomendar", arguments: { presentes: ["dono"] } })) as Resultado;

    assert.ok(!resultado.isError);
    const saida = json(resultado);
    assert.deepEqual(saida.presentes, ["bruno"]);
    assert.equal(saida.filmes.length, 5);
    assert.equal(saida.filmes[0].titulo, "As Horas Lentas");
    for (const filme of saida.filmes) {
      for (const evidencia of filme.evidencias) {
        assert.deepEqual(
          Object.keys(evidencia).sort(),
          ["contribuicao", "data", "fato_id", "fonte", "forca", "pessoa", "texto", "tipo"],
        );
      }
    }
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

  it("recomendar repassa as Restrições da Sessão", async () => {
    const resultado = (await cliente.callTool({
      name: "recomendar",
      arguments: {
        presentes: ["dono"], quantos: 50, duracao_max: 110, idioma: "pt", idade_crianca: 7,
        gatilhos: ["a dog dies"],
      },
    })) as Resultado;

    assert.ok(!resultado.isError);
    const saida = json(resultado);
    assert.deepEqual(Object.keys(saida.restricoes).sort(), ["crianca", "duracao", "gatilho", "idioma"]);
    assert.equal(saida.restricoes.crianca.idade, 7);
    assert.deepEqual(saida.restricoes.gatilho.temas, ["a dog dies"]);
    // Em português, até 1h50 e até a faixa 6, só sobra Maré Baixa; sem chave do Does the Dog Die, fica com aviso.
    assert.deepEqual(saida.filmes.map((f: any) => f.titulo), ["Maré Baixa"]);
    const linhas = saida.filmes[0].evidencias.filter((e: any) => e.pessoa === null).map((e: any) => e.texto);
    assert.deepEqual(linhas.sort(), [
      "duração 1h38, dentro do limite de 1h50",
      "classificação L (Kijkwijzer AL convertida)",
      'sem dado do Does the Dog Die sobre "a dog dies"',
      "idioma original português",
    ].sort());
  });

  it("sem Já visto tira o que o Dono já viu", async () => {
    const resultado = (await cliente.callTool({
      name: "recomendar", arguments: { presentes: ["dono"], quantos: 50, sem_ja_visto: true },
    })) as Resultado;

    const titulos = json(resultado).filmes.map((f: any) => f.titulo);
    assert.ok(titulos.includes("As Horas Lentas"));
    assert.ok(!titulos.includes("O Farol de Areia"));
  });

  it("tem criança sem idade vale livre", async () => {
    const resultado = (await cliente.callTool({
      name: "recomendar", arguments: { presentes: ["dono"], quantos: 50, crianca: true },
    })) as Resultado;

    const saida = json(resultado);
    assert.equal(saida.restricoes.crianca.idade, 0);
    assert.deepEqual(saida.filmes.map((f: any) => f.titulo).sort(), ["Maré Baixa", "O Farol de Areia"]);
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
});
