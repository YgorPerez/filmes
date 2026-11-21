import { z } from "zod";
import { definirFerramenta, semHifen } from "../ferramenta.ts";

const pessoa = semHifen("nome de Pessoa");

export default definirFerramenta({
  nome: "recomendar",
  descricao:
    "Recomendação para uma Sessão: devolve o top 5 na ordem da Regra de escolha. Cada filme traz " +
    "`utilidade` (0 a 1, ou null quando não há Fato) e `evidencias` agrupadas por Presente " +
    "(pessoa, texto, fonte, data, forca, tipo, fato_id, contribuicao); quem não tem Fato sobre o filme " +
    'recebe a linha "sem fato". Fora das Evidências, cada filme traz `imdb` (link), `generos` (do IMDb, em português) ' +
    "`capa` (pôster do TMDB em w185), `titulo_pt` e `sinopse` (a primeira frase do overview), os três do TMDB em pt-BR " +
    "e null sem chave do TMDB ou sem o dado, `nota_imdb` e `votos_imdb`, e `cobertura` ({com_fato, presentes, sem_fato: slugs}). " +
    "`vetos` lista os Vetos dos Presentes que tiraram filmes, com `filmes_tirados` e `por_caminho` " +
    "({direto, subgeneros, genero_imdb}): um Veto a gênero tira também os subgêneros do Wikidata e o gênero do IMDb. " +
    "`so_palpites` marca filme sem Fato nenhum, que só entra no fim quando " +
    'faltam Candidatos com Fato. Presentes por slug, nome ou apelido; "dono" é o Dono. ' +
    "Restrições opcionais (duração, ano de lançamento, idioma, criança, gatilhos, sem Já visto) tiram filmes antes da ordenação. " +
    "Cada filme que passa traz em `linhas_do_filme` as linhas das Restrições, do Clima e de grupo ou sozinho. " +
    "Clima e grupo ou sozinho puxam a ordem dos filmes. " +
    "A linha de Crédito aparece em `linhas_do_filme` quando o Crédito fez o filme subir. " +
    "`credito` traz o Crédito de cada Presente na Regra padrão em grupo. Cada chamada abre uma Sessão (`sessao.id`). " +
    "Antes, chame `sessoes_abertas` e, se houver uma, pergunte por ela. O Dono pode pular. " +
    "A resposta inclui `climas` (os aceitos), `restricoes`, `avisos` e `atribuicoes`. " +
    "Copie o texto do Does the Dog Die como veio.",
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
    pedido: z.string().optional().describe("o pedido do Dono como ele disse, guardado na Sessão"),
    duracao_max: z.number().int().min(1).optional().describe("tempo disponível, em minutos"),
    desde: z.number().int().optional().describe('ano de lançamento mínimo, inclusive: "de 1990 em diante" é 1990'),
    ate: z.number().int().optional().describe('ano de lançamento máximo, inclusive: "até 2005" é 2005; "anos 90" é desde 1990 e ate 1999'),
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
    if (e.desde !== undefined) args.push(`--desde=${e.desde}`);
    if (e.ate !== undefined) args.push(`--ate=${e.ate}`);
    if (e.idioma) args.push(`--idioma=${e.idioma}`);
    if (e.idade_crianca !== undefined) args.push("--crianca", String(e.idade_crianca));
    else if (e.crianca) args.push("--crianca");
    for (const gatilho of e.gatilhos ?? []) args.push(`--gatilho=${gatilho}`);
    if (e.sem_ja_visto) args.push("--sem-ja-visto");
    if (e.pedido !== undefined) args.push(`--pedido=${e.pedido}`);
    for (const clima of e.climas ?? []) args.push(`--clima=${clima}`);
    return { comando: "recomendar", args };
  },
});
