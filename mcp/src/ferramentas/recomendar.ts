import { z } from "zod";
import { definirFerramenta } from "../ferramenta.ts";

const pessoa = z.string().regex(/^[^-\s]/, "nome de Pessoa não pode começar com '-' nem espaço");

export default definirFerramenta({
  nome: "recomendar",
  descricao:
    "Recomendação para uma Sessão: devolve o top 5 com as Evidências de cada filme " +
    "(pessoa, texto, fonte, data, forca, tipo, fato_id, contribuicao). " +
    'Presentes por slug, nome ou apelido; "dono" é o Dono. ' +
    "Restrições opcionais tiram filmes antes da ordenação; cada filme que passa traz linhas do filme " +
    "(Evidências com pessoa nula) que dizem por quê. Devolve também restricoes, avisos e creditos. " +
    "Texto do Does the Dog Die vai citado como veio, nunca parafraseado.",
  entrada: {
    presentes: z.array(pessoa).min(1).describe('Pessoas da Sessão, ex.: ["dono", "ana"]'),
    quantos: z.number().int().min(1).max(100).optional().describe("tamanho da lista; padrão 5"),
    duracao_max: z.number().int().min(1).optional().describe("tempo disponível, em minutos"),
    idioma: z.string().min(1).optional().describe('idioma original exigido, só quando pedido: "pt", "português" ou o QID'),
    crianca: z.boolean().optional().describe('"tem criança" sem idade: vale livre (L)'),
    idade_crianca: z.number().int().min(0).max(17).optional().describe("idade da criança mais nova"),
    gatilhos: z.array(z.string().min(1)).min(1).optional()
      .describe('temas do Does the Dog Die a evitar, em inglês como o site escreve, ex.: ["a dog dies"]'),
    sem_ja_visto: z.boolean().optional().describe("tira os filmes que algum Presente já viu"),
  },
  cli: (e) => {
    const args = ["--presentes", ...e.presentes];
    if (e.quantos) args.push("--quantos", String(e.quantos));
    if (e.duracao_max) args.push("--duracao-max", String(e.duracao_max));
    if (e.idioma) args.push(`--idioma=${e.idioma}`);
    if (e.idade_crianca !== undefined) args.push("--crianca", String(e.idade_crianca));
    else if (e.crianca) args.push("--crianca");
    for (const gatilho of e.gatilhos ?? []) args.push(`--gatilho=${gatilho}`);
    if (e.sem_ja_visto) args.push("--sem-ja-visto");
    return { comando: "recomendar", args };
  },
});
