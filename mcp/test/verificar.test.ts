import assert from "node:assert/strict";
import { it } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { criarServidor } from "../src/servidor.ts";
import { prepararAmbiente } from "./ambiente.ts";

it("verificar_resposta devolve as linhas que a Sessão não sustenta", async () => {
  const limpar = prepararAmbiente();
  const cliente = new Client({ name: "teste", version: "0" });
  try {
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

    const { sessao } = await chamar("recomendar", { presentes: ["dono", "teo"], de: "dono", quantos: 1 });
    const valido = "- **Teo:** sem fato *(fraca, palpite)*";
    const invalido = "- **Teo:** gosta muito da diretora *(forte, declarado)*";
    const inicio = "Você e Teo.\n\n**1. As Horas Lentas** (2021, 1h44)\n";

    assert.deepEqual(await chamar("verificar_resposta", { sessao: sessao.id, texto: inicio + valido }),
      { valida: true, linhas_invalidas: [] });
    assert.deepEqual(await chamar("verificar_resposta", { sessao: sessao.id, texto: inicio + invalido }),
      { valida: false, linhas_invalidas: [invalido] });
  } finally {
    await cliente.close();
    limpar();
  }
});
