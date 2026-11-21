import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { criarServidor } from "../src/servidor.ts";
import { prepararAmbiente } from "./ambiente.ts";

it("exporta as Notas do Bruno no CSV do IMDb pelo MCP", async () => {
  const limpar = prepararAmbiente();
  const cliente = new Client({ name: "teste", version: "0" });
  try {
    const servidor = await criarServidor();
    const [doCliente, doServidor] = InMemoryTransport.createLinkedPair();
    await servidor.connect(doServidor);
    await cliente.connect(doCliente);

    const arquivo = join(process.env.FILMES_DADOS!, "bruno-imdb.csv");
    const resposta = await cliente.callTool({
      name: "exportar", arguments: { pessoa: "bruno", formato: "imdb", saida: arquivo },
    });
    const [bloco] = resposta.content as Array<{ type: string; text: string }>;
    assert.ok(!resposta.isError, bloco.text);
    const saida = JSON.parse(bloco.text);
    assert.equal(saida.arquivo, arquivo);
    const linhas = readFileSync(arquivo, "utf-8").trim().split(/\r?\n/);
    assert.match(linhas[0], /^Const,Your Rating,Date Rated,Title,/);
    assert.equal(linhas.length - 1, saida.notas);

    const invalida = await cliente.callTool({ name: "exportar", arguments: { pessoa: "bruno", formato: "csv", saida: arquivo } });
    assert.equal(invalida.isError, true);
  } finally {
    await cliente.close();
    limpar();
  }
});
