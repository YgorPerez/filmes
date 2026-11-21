import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { comandoPython, RAIZ } from "../src/cli.ts";
import { criarServidor } from "../src/servidor.ts";
import { prepararAmbiente } from "./ambiente.ts";

it("importa o ZIP e confirma ou descarta as pendências pelo MCP", async () => {
  const limpar = prepararAmbiente();
  const cliente = new Client({ name: "teste", version: "0" });
  try {
    const fixture = join(RAIZ, "tests", "fixture");
    const zip = join(process.env.FILMES_DADOS!, "olga.zip");
    const csvs = ["watched", "ratings", "diary", "reviews", "watchlist"].map((nome) => nome + ".csv");
    execFileSync(comandoPython(), ["-m", "zipfile", "-c", zip, ...csvs],
      { cwd: join(fixture, "letterboxd", "olga") });
    process.env.FILMES_TMDB_CHAVE = "chave-de-teste";
    process.env.FILMES_GRAVACOES = join(fixture, "gravacoes");

    const servidor = await criarServidor();
    const [doCliente, doServidor] = InMemoryTransport.createLinkedPair();
    await servidor.connect(doServidor);
    await cliente.connect(doCliente);
    async function chamar(name: string, args: Record<string, unknown>) {
      const resultado = await cliente.callTool({ name, arguments: args });
      const [bloco] = resultado.content as Array<{ type: string; text: string }>;
      assert.ok(!resultado.isError, bloco.text);
      assert.equal(bloco.type, "text");
      return JSON.parse(bloco.text);
    }

    const relatorio = await chamar("importar", { pessoa: "iara", letterboxd: zip });
    assert.equal(relatorio.fila, 2);
    assert.equal(relatorio.resolvidos.tmdb, 1);
    const { itens } = await chamar("fila_import", { acao: "ver" });
    const [perdido, vento] = itens;
    assert.equal(vento.nome, "Vento Norte");
    await chamar("fila_import", { acao: "confirmar", id: vento.id, filme: "tt9000302" });
    await chamar("fila_import", { acao: "descartar", id: perdido.id, motivo: "não é filme" });
    assert.deepEqual((await chamar("fila_import", { acao: "ver" })).itens, []);
  } finally {
    await cliente.close();
    limpar();
  }
});
