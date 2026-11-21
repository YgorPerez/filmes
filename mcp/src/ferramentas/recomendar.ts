import { z } from "zod";
import { definirFerramenta } from "../ferramenta.ts";

const pessoa = z.string().regex(/^[^-\s]/, "nome de Pessoa não pode começar com '-' nem espaço");

export default definirFerramenta({
  nome: "recomendar",
  descricao:
    "Recomendação para uma Sessão: devolve o top 5 na ordem da Regra de escolha. Cada filme traz " +
    "`utilidade` (0 a 1, ou null quando não há Fato) e `evidencias` agrupadas por Presente " +
    "(pessoa, texto, fonte, data, forca, tipo, fato_id, contribuicao); quem não tem Fato sobre o filme " +
    'recebe a linha "sem fato". `vetos` lista os Vetos dos Presentes que tiraram filmes. ' +
    "`so_palpites` marca filme sem Fato nenhum, que só entra no fim quando " +
    'faltam Candidatos com Fato. Presentes por slug, nome ou apelido; "dono" é o Dono. ' +
    "Restrições opcionais (duração, idioma, criança, gatilhos, sem Já visto) tiram filmes antes da ordenação; " +
    "cada filme que passa traz em `linhas_do_filme` as linhas que dizem por quê. Também em `linhas_do_filme`, " +
    'sem Pessoa: o Clima pedido e "para ver em grupo" ou "para ver sozinho", que puxam a ordem sem tirar filme. ' +
    "Devolve também `climas` (os aceitos), `restricoes`, `avisos` (Clima fora do vocabulário, fonte sem chave) " +
    "e `creditos`. Texto do Does the Dog Die vai citado como veio, nunca parafraseado.",
  entrada: {
    presentes: z.array(pessoa).min(1).describe('Pessoas da Sessão, ex.: ["dono", "ana"]'),
    regra: z
      .enum(["padrao", "media", "de"])
      .optional()
      .describe(
        "Regra de escolha: padrao (menor utilidade entre os Presentes, desempate pela média; é o padrão), " +
          'media (média simples, "tanto faz") ou de (só o gosto de uma Pessoa, "hoje é a vez da Ana")',
      ),
    de: pessoa.optional().describe('na regra "de", a Pessoa cujo gosto ordena; precisa estar entre os Presentes'),
    climas: z
      .array(z.string())
      .optional()
      .describe(
        "Climas do pedido, do vocabulário fixo: leve, pra rir, tenso, romântico, pra chorar, pra pensar, " +
          'assustador, ação. "Algo leve" é leve; "pra dar risada" é pra rir. Fora da lista, o motor devolve um aviso',
      ),
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
    if (e.regra) args.push("--regra", e.regra);
    if (e.de) args.push("--de", e.de);
    if (e.quantos) args.push("--quantos", String(e.quantos));
    if (e.duracao_max) args.push("--duracao-max", String(e.duracao_max));
    if (e.idioma) args.push(`--idioma=${e.idioma}`);
    if (e.idade_crianca !== undefined) args.push("--crianca", String(e.idade_crianca));
    else if (e.crianca) args.push("--crianca");
    for (const gatilho of e.gatilhos ?? []) args.push(`--gatilho=${gatilho}`);
    if (e.sem_ja_visto) args.push("--sem-ja-visto");
    for (const clima of e.climas ?? []) args.push(`--clima=${clima}`);
    return { comando: "recomendar", args };
  },
});
