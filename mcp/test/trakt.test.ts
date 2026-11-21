import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { comandoPython, RAIZ } from "../src/cli.ts";
import { criarServidor } from "../src/servidor.ts";
import { prepararAmbiente } from "./ambiente.ts";

it("importa notas e histórico do Trakt pelo MCP", async () => {
  const limpar = prepararAmbiente();
  const cliente = new Client({ name: "teste", version: "0" });
  try {
    const zip = join(process.env.FILMES_DADOS!, "trakt.zip");
    execFileSync(comandoPython(), ["-m", "zipfile", "-c", zip, "ratings-movies.json", "watched-history-1.json"],
      { cwd: join(RAIZ, "tests", "fixture", "trakt") });
    const servidor = await criarServidor();
    const [doCliente, doServidor] = InMemoryTransport.createLinkedPair();
    await servidor.connect(doServidor);
    await cliente.connect(doCliente);

    const resposta = await cliente.callTool({ name: "importar", arguments: { pessoa: "teo", trakt: zip } });
    const [bloco] = resposta.content as Array<{ type: string; text: string }>;
    assert.ok(!resposta.isError, bloco.text);
    assert.equal(bloco.type, "text");
    assert.deepEqual(JSON.parse(bloco.text).fatos_novos, { notas: 2, ja_visto: 1 });

    for (const argumentos of [{ pessoa: "teo" }, { pessoa: "teo", trakt: zip, letterboxd: zip }]) {
      const invalida = await cliente.callTool({ name: "importar", arguments: argumentos });
      assert.equal(invalida.isError, true);
    }
  } finally {
    await cliente.close();
    limpar();
  }
});
