import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { criarServidor } from "../src/servidor.ts";
import { prepararAmbiente } from "./ambiente.ts";

type Resultado = { isError?: boolean; content: Array<{ type: string; text?: string }> };

describe("recomendar com parecido (#67)", () => {
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

  it("só traz os parecidos com as referências, com a linha do porquê", async () => {
    const resultado = (await cliente.callTool({
      name: "recomendar",
      arguments: { presentes: ["dono"], parecido: ["tt9006702"] },
    })) as Resultado;

    assert.ok(!resultado.isError, resultado.content[0].text ?? "");
    const saida = JSON.parse(resultado.content[0].text!);
    assert.deepEqual(saida.filmes.map((f: any) => f.id), ["tt9006713"]);
    assert.equal(saida.filmes[0].linhas_do_filme[0].texto, "parecido com Estrada Afora: road trip");
    assert.ok(saida.avisos.includes("só 1 parecido com Estrada Afora passou nas Restrições"));
  });

  it("o parecido fica na Sessão e sem_parecido tira (#68)", async () => {
    const chamar = async (args: Record<string, unknown>) => {
      const resultado = (await cliente.callTool({ name: "recomendar", arguments: args })) as Resultado;
      assert.ok(!resultado.isError, resultado.content[0].text ?? "");
      return JSON.parse(resultado.content[0].text!);
    };
    const primeira = await chamar({ presentes: ["dono"], parecido: ["tt9006702"] });
    const sessao = primeira.sessao.id;

    const segunda = await chamar({ presentes: ["dono"], sessao });
    const terceira = await chamar({ presentes: ["dono"], sessao, sem_parecido: true });

    assert.deepEqual(segunda.restricoes.parecido.filmes, ["tt9006702"]);
    assert.deepEqual(segunda.filmes.map((f: any) => f.id), ["tt9006713"]);
    assert.equal(terceira.restricoes.parecido, undefined);
  });

  it("trocar grava os filmes da tela como Trocados e o refazer traz outros (revisão do #70)", async () => {
    const chamar = async (args: Record<string, unknown>) => {
      const resultado = (await cliente.callTool({ name: "recomendar", arguments: args })) as Resultado;
      assert.ok(!resultado.isError, resultado.content[0].text ?? "");
      return JSON.parse(resultado.content[0].text!);
    };
    const primeira = await chamar({ presentes: ["dono"] });
    const tela = primeira.filmes.map((f: any) => f.id);

    const segunda = await chamar({ presentes: ["dono"], sessao: primeira.sessao.id, trocar: tela });

    assert.equal(segunda.filmes.filter((f: any) => tela.includes(f.id)).length, 0);
    assert.equal(segunda.restricoes.fora_da_sessao.trocados, tela.length);
  });

  it("recusa o que não é ID do IMDb", async () => {
    const resultado = (await cliente.callTool({
      name: "recomendar",
      arguments: { presentes: ["dono"], parecido: ["Stuck in Love"] },
    })) as Resultado;

    assert.ok(resultado.isError);
  });
});
