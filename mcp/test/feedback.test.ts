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

describe("registrar_feedback com nota de 1 a 10 e comentário", () => {
  let limpar: () => void;
  let cliente: Client;

  async function chamar(name: string, args: Record<string, unknown>): Promise<Resultado> {
    return (await cliente.callTool({ name, arguments: args })) as Resultado;
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

  it("converte a nota de 10, guarda o original e grava o comentário como Declarado", async () => {
    const sessao = json(await chamar("recomendar", { presentes: ["dono", "iara", "teo"] })).sessao.id;

    const resultado = await chamar("registrar_feedback", {
      sessao,
      filme: "Noite de Estreia",
      notas: [
        { pessoa: "dono", nota: 9, escala: 10, comentario: "-- enquadramento e diálogo muito bons" },
        { pessoa: "iara", nota: 2 },
      ],
      relatos: [{ pessoa: "teo", reacao: "não gostou", comentario: "muita violência sem sentido" }],
    });

    assert.ok(!resultado.isError, JSON.stringify(resultado.content));
    const fatos = json(resultado).fatos.filter((f: { texto: string }) => f.texto !== "já viu");
    assert.deepEqual(
      fatos.map((f: { pessoa: string; texto: string }) => [f.pessoa, f.texto]),
      [
        ["bruno", "deu 9/10 a Noite de Estreia (2022)"],
        ["iara", "deu 2 a Noite de Estreia (2022)"],
        ["teo", "não gostou de Noite de Estreia (2022)"],
        ["bruno", 'disse "-- enquadramento e diálogo muito bons" de Noite de Estreia (2022)'],
        ["teo", 'disse "muita violência sem sentido" de Noite de Estreia (2022)'],
      ],
    );
    const notas = json(await chamar("consultar", { sql: "SELECT pessoa, nota FROM notas WHERE sessao IS NOT NULL ORDER BY pessoa" }));
    assert.deepEqual(notas.linhas, [["bruno", 4.5], ["iara", 2]]);
  });

  it("recusa nota fora da escala de 10", async () => {
    const sessao = json(await chamar("recomendar", { presentes: ["iara"] })).sessao.id;

    const resultado = await chamar("registrar_feedback", {
      sessao,
      filme: "Vento Norte",
      notas: [{ pessoa: "iara", nota: 0.5, escala: 10 }],
    });

    assert.equal(resultado.isError, true);
  });
});
