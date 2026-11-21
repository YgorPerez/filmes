import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
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

  it("recomendar passa os Climas, e o vocabulário da descrição é o do motor", async () => {
    const { tools } = await cliente.listTools();
    const climas = tools.find((t) => t.name === "recomendar")!.inputSchema.properties!.climas as { description: string };
    const vocabulario = climas.description.match(/vocabulário fixo: ([^.]+)\./)![1].split(", ");

    const resultado = (await cliente.callTool({
      name: "recomendar",
      arguments: { presentes: ["dono"], climas: [...vocabulario, " épico ", "--sem-ja-visto"] },
    })) as Resultado;

    assert.ok(!resultado.isError);
    const saida = json(resultado);
    assert.deepEqual(saida.climas, vocabulario);
    const [aviso, avisoComHifen] = saida.avisos;
    assert.ok(aviso.startsWith("o Clima 'épico' não está no vocabulário"));
    assert.ok(aviso.endsWith(`Os Climas são ${vocabulario.join(", ")}.`));
    assert.ok(avisoComHifen.startsWith("o Clima '--sem-ja-visto' não está no vocabulário"));
    assert.deepEqual(saida.restricoes, {});
    assert.ok(Array.isArray(saida.filmes[0].linhas_do_filme));
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
    const linhas = saida.filmes[0].linhas_do_filme.map((e: any) => e.texto);
    assert.deepEqual(linhas.sort(), [
      "duração 1h38, dentro do limite de 1h50",
      "classificação L (Kijkwijzer AL convertida)",
      'sem informação do Does the Dog Die sobre "a dog dies"',
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

  it("recomendar repassa o intervalo de anos", async () => {
    const resultado = (await cliente.callTool({
      name: "recomendar", arguments: { presentes: ["dono"], quantos: 50, desde: 2015, ate: 2016 },
    })) as Resultado;

    assert.ok(!resultado.isError);
    const saida = json(resultado);
    assert.deepEqual(saida.restricoes.ano, { desde: 2015, ate: 2016, tirados: saida.restricoes.ano.tirados });
    assert.ok(saida.restricoes.ano.tirados > 0);
    const titulos = saida.filmes.map((f: any) => f.titulo);
    assert.ok(titulos.includes("Maré Baixa"));
    assert.ok(!titulos.includes("O Farol de Areia"));
  });

  it("nada triste tira o filme triste e conta por sinal", async () => {
    const resultado = (await cliente.callTool({
      name: "recomendar", arguments: { presentes: ["dono"], quantos: 100, sem_tristeza: true },
    })) as Resultado;

    assert.ok(!resultado.isError);
    const saida = json(resultado);
    assert.deepEqual(saida.restricoes.sem_tristeza, { por_sinal: { triste: 2, tema_pesado: 3 }, tirados: 5 });
    const titulos = saida.filmes.map((f: any) => f.titulo);
    assert.ok(titulos.includes("Casa Cheia"));
    assert.ok(!titulos.includes("Pequenos Milagres"));
  });

  it("tem criança sem idade vale livre", async () => {
    const resultado = (await cliente.callTool({
      name: "recomendar", arguments: { presentes: ["dono"], quantos: 50, crianca: true },
    })) as Resultado;

    const saida = json(resultado);
    assert.equal(saida.restricoes.crianca.idade, 0);
    assert.deepEqual(saida.filmes.map((f: any) => f.titulo).sort(), ["Maré Baixa", "O Farol de Areia"]);
  });

  it("recomendar com sessao refaz a Recomendação na mesma Sessão aberta", async () => {
    const primeira = json(
      (await cliente.callTool({ name: "recomendar", arguments: { presentes: ["dono", "quim"], pedido: "algo bom" } })) as Resultado,
    );
    const resultado = (await cliente.callTool({
      name: "recomendar",
      arguments: { presentes: ["dono", "quim"], pedido: "algo curto", duracao_max: 100, sessao: primeira.sessao.id },
    })) as Resultado;

    assert.ok(!resultado.isError, JSON.stringify(resultado.content));
    assert.deepEqual(json(resultado).sessao, { ...primeira.sessao, versao: 2 });
    const abertas = json((await cliente.callTool({ name: "sessoes_abertas", arguments: {} })) as Resultado);
    const comQuim = abertas.sessoes.filter((s: { presentes: string[] }) => s.presentes.includes("quim"));
    assert.deepEqual(comQuim.map((s: { pedido: string; versao: number }) => [s.pedido, s.versao]), [["algo curto", 2]]);
  });

  it("erro da CLI chega como erro da ferramenta", async () => {
    const resultado = (await cliente.callTool({ name: "recomendar", arguments: { presentes: ["fulano"] } })) as Resultado;

    assert.equal(resultado.isError, true);
    assert.equal(json(resultado).erro.codigo, "pessoa_desconhecida");
  });

  it("cartaz grava o HTML da Sessão e devolve o caminho para o html_render", async () => {
    const recomendacao = json(
      (await cliente.callTool({ name: "recomendar", arguments: { presentes: ["dono"] } })) as Resultado,
    );

    const resultado = (await cliente.callTool({
      name: "cartaz",
      arguments: { sessao: recomendacao.sessao.id },
    })) as Resultado;

    assert.ok(!resultado.isError);
    const saida = json(resultado);
    assert.equal(saida.sessao, recomendacao.sessao.id);
    assert.equal(saida.filmes, 5);
    assert.ok(isAbsolute(saida.arquivo));
    const html = readFileSync(saida.arquivo, "utf8");
    assert.ok(html.startsWith("<!doctype html>"));
    assert.equal(html.match(/<article class="card">/g)?.length, 5);
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
