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
    await chamar("fila_import", { acao: "descartar", id: perdido.id, razao: "não é filme" });
    assert.deepEqual((await chamar("fila_import", { acao: "ver" })).itens, []);
  } finally {
    await cliente.close();
    limpar();
  }
});

it("importa o RSS do Letterboxd pelo usuário", async () => {
  const limpar = prepararAmbiente();
  const cliente = new Client({ name: "teste", version: "0" });
  try {
    process.env.FILMES_TMDB_CHAVE = "chave-de-teste";
    process.env.FILMES_GRAVACOES = join(RAIZ, "tests", "fixture", "gravacoes");
    const servidor = await criarServidor();
    const [doCliente, doServidor] = InMemoryTransport.createLinkedPair();
    await servidor.connect(doServidor);
    await cliente.connect(doCliente);

    const resultado = await cliente.callTool({ name: "importar", arguments: { pessoa: "iara", letterboxd_rss: "olga_farol" } });
    const [bloco] = resultado.content as Array<{ type: string; text: string }>;
    assert.ok(!resultado.isError, bloco.text);
    const relatorio = JSON.parse(bloco.text);
    assert.equal(relatorio.fatos_novos.notas, 4);
    assert.equal(relatorio.fila, 0);

    const invalido = await cliente.callTool({ name: "importar", arguments: { pessoa: "iara", letterboxd_rss: "../x" } });
    assert.ok(invalido.isError);
  } finally {
    await cliente.close();
    limpar();
  }
});

it("reprocessa a fila de uma Pessoa pelo MCP", async () => {
  const limpar = prepararAmbiente();
  const cliente = new Client({ name: "teste", version: "0" });
  try {
    const fixture = join(RAIZ, "tests", "fixture");
    const zip = join(process.env.FILMES_DADOS!, "olga.zip");
    execFileSync(comandoPython(), ["-m", "zipfile", "-c", zip, "watched.csv"],
      { cwd: join(fixture, "letterboxd", "olga") });
    delete process.env.FILMES_TMDB_CHAVE;
    process.env.FILMES_GRAVACOES = join(fixture, "gravacoes");
    const servidor = await criarServidor();
    const [doCliente, doServidor] = InMemoryTransport.createLinkedPair();
    await servidor.connect(doServidor);
    await cliente.connect(doCliente);
    async function chamar(name: string, args: Record<string, unknown>) {
      const resultado = await cliente.callTool({ name, arguments: args });
      const [bloco] = resultado.content as Array<{ type: string; text: string }>;
      assert.ok(!resultado.isError, bloco.text);
      return JSON.parse(bloco.text);
    }

    await chamar("importar", { pessoa: "iara", letterboxd: zip });
    process.env.FILMES_TMDB_CHAVE = "chave-de-teste";
    const saida = await chamar("fila_import", { acao: "reprocessar", pessoa: "iara" });
    assert.deepEqual(saida.pessoas, ["iara"]);
    assert.ok(saida.resolvidos.some((i: { nome: string }) => i.nome === "Rio Abaixo"));
  } finally {
    await cliente.close();
    limpar();
  }
});
