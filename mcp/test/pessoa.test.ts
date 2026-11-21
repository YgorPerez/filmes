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

describe("ferramenta pessoa", () => {
  let limpar: () => void;
  let cliente: Client;

  async function pessoa(args: Record<string, unknown>): Promise<Resultado> {
    return (await cliente.callTool({ name: "pessoa", arguments: args })) as Resultado;
  }

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

  it("cria, declara, relata, veta e mostra a Pessoa", async () => {
    assert.ok(!(await pessoa({ acao: "criar", nome: "Ana", slug: "ana", apelidos: ["Aninha"] })).isError);
    const declarado = await pessoa({
      acao: "declarar", pessoa: "ana", texto: "adoro a Sofia Rangel", entidade: "Q9000018",
      reacao: "gosta", fonte: "questionário",
    });
    assert.equal(json(declarado).declarado.forca, "forte");
    const relato = await pessoa({ acao: "relatar", pessoa: "ana", texto: "-- odeia filme lento" });
    assert.equal(json(relato).relato.texto, "-- odeia filme lento");
    assert.ok(!(await pessoa({ acao: "vetar", pessoa: "ana", texto: "nunca vê terror", entidade: "Q9001801" })).isError);

    const saida = json(await pessoa({ acao: "ver", pessoa: "Aninha" }));

    assert.equal(saida.pessoa, "ana");
    assert.equal(saida.declarados.length, 1);
    assert.equal(saida.relatos.length, 1);
    assert.deepEqual(saida.vetos.map((v: any) => v.rotulo), ["Terror"]);
  });

  it("o Veto age na Recomendação", async () => {
    const resultado = (await cliente.callTool({
      name: "recomendar", arguments: { presentes: ["dono", "ana"], quantos: 50 },
    })) as Resultado;

    assert.deepEqual(json(resultado).vetos.map((v: any) => v.pessoa), ["ana"]);
  });

  it("ação sem o que ela precisa é recusada", async () => {
    assert.equal((await pessoa({ acao: "vetar", pessoa: "ana", texto: "nunca vê terror" })).isError, true);
    assert.equal((await pessoa({ acao: "ver" })).isError, true);
  });
});
