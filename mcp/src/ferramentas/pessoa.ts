import { z } from "zod";
import { definirFerramenta, semHifen } from "../ferramenta.ts";

const PRECISA: Record<string, string[]> = {
  criar: ["nome"],
  ver: ["pessoa"],
  declarar: ["pessoa", "texto"],
  relatar: ["pessoa", "texto"],
  vetar: ["pessoa", "texto"],
  visto: ["pessoa", "filme"],
  ajustar: ["pessoa", "elo", "nivel"],
  remover: ["pessoa"],
};

const REMOVIVEIS = ["declarado", "relato", "veto", "visto"] as const;

export default definirFerramenta({
  nome: "pessoa",
  descricao:
    "Pessoas no repo de dados. criar: nome, apelidos, slug, dono. ver: tudo o que se sabe da Pessoa " +
    "(Vetos, Declarados, Relatos com Força, Notas). declarar: o que a própria Pessoa disse do gosto dela; " +
    "relatar: o que o Dono sabe do gosto de outra Pessoa; vetar: um tipo de filme que ela nunca vê. " +
    "Alvo por ID do Catálogo (filme tt..., entidade Q... de diretor, ator ou gênero; ache com consultar). " +
    "Sobre um filme, reacao ama vira Nota 5 e odeia vira Nota 1. Sem alvo, o texto fica guardado mas não muda a ordem. " +
    "Um Veto precisa de alvo. visto: a Pessoa já viu o filme; com nota, grava também a Nota que ela deu " +
    '(de 0,5 a 5, ou de 1 a 10 escrita "8/10"). remover: tira um item registrado por engano; informe um só de ' +
    "declarado, relato, veto ou visto, com o fato_id que ver mostra ou o alvo (tt..., Q...) quando só um item tem esse alvo. " +
    "ajustar: quanto um elo do caminho de conteúdo (diretor, roteiro, elenco, serie, genero) pesa para a Pessoa, " +
    '"pra ele ator não importa" é elo elenco, nivel nada; nada tira as Evidências do elo, pouco vale metade e desce ' +
    "a Força um nível, muito vale 1,5 vez, normal desfaz. O Declarado sobre um ator ou diretor nomeado continua valendo. " +
    "O que se grava ou remove vale já na próxima Recomendação.",
  entrada: {
    acao: z.enum(["criar", "ver", "declarar", "relatar", "vetar", "visto", "ajustar", "remover"]),
    pessoa: semHifen("pessoa").optional().describe('slug, nome ou apelido; "dono" é o Dono'),
    nome: semHifen("nome").optional().describe("criar: nome da Pessoa"),
    apelidos: z.array(semHifen("apelido")).optional().describe("criar: como o Dono a chama"),
    slug: semHifen("slug").optional().describe("criar: nome do arquivo; padrão é o nome sem acento"),
    dono: z.boolean().optional().describe("criar: esta Pessoa é o Dono"),
    texto: z.string().min(1).optional().describe("declarar, relatar, vetar: o que foi dito, como foi dito"),
    filme: semHifen("filme").optional().describe("alvo: ID do filme (tt...)"),
    entidade: semHifen("entidade").optional().describe("alvo: ID da entidade (Q...)"),
    reacao: z.enum(["ama", "gosta", "nao-gosta", "odeia"]).optional().describe("declarar, relatar: reação ao alvo"),
    especificidade: z.enum(["especifico", "generico"]).optional()
      .describe("declarar, relatar: específico nomeia filme, diretor, ator ou subgênero; padrão vem do alvo"),
    nota: z.string().regex(/^\d+([.,]\d+)?(\/10)?$/).optional()
      .describe('visto: a Nota que a Pessoa deu, de 0,5 a 5 ("4,5") ou de 1 a 10 ("8/10")'),
    review: z.boolean().optional().describe("declarar: é review ou tag que a própria Pessoa escreveu"),
    fonte: semHifen("fonte").optional().describe('declarar, relatar, visto: de onde veio, ex.: "questionário"'),
    elo: z.enum(["diretor", "roteiro", "elenco", "serie", "genero"]).optional().describe("ajustar: o elo"),
    nivel: z.enum(["nada", "pouco", "normal", "muito"]).optional().describe("ajustar: quanto o elo pesa; normal desfaz"),
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("AAAA-MM-DD; padrão hoje"),
    declarado: z.string().min(1).optional().describe("remover: fato_id ou alvo do Declarado"),
    relato: z.string().min(1).optional().describe("remover: fato_id ou alvo do Relato"),
    veto: z.string().min(1).optional().describe("remover: fato_id ou alvo do Veto"),
    visto: z.string().min(1).optional().describe("remover: fato_id ou filme do Já visto"),
  },
  cli: (e) => {
    const faltando = PRECISA[e.acao].filter((campo) => e[campo as keyof typeof e] === undefined);
    if (faltando.length) throw new Error(`pessoa ${e.acao} precisa de: ${faltando.join(", ")}`);
    if (e.acao === "vetar" && !e.filme && !e.entidade) throw new Error("pessoa vetar precisa de filme ou entidade");

    const opcoes: string[] = [];
    const opcao = (nome: string, valor: string | undefined) => {
      if (valor !== undefined) opcoes.push(`--${nome}`, valor);
    };
    if (e.acao === "criar") {
      for (const apelido of e.apelidos ?? []) opcao("apelido", apelido);
      opcao("slug", e.slug);
      if (e.dono) opcoes.push("--dono");
      return { comando: "pessoa", args: ["criar", ...opcoes, "--", e.nome!] };
    }
    if (e.acao === "remover") {
      const itens = REMOVIVEIS.filter((tipo) => e[tipo] !== undefined);
      if (itens.length !== 1) throw new Error("pessoa remover precisa de um só entre declarado, relato, veto e visto");
      const [tipo] = itens;
      return { comando: "pessoa", args: ["remover", `--${tipo}=${e[tipo]}`, "--", e.pessoa!] };
    }
    if (e.acao === "ver") return { comando: "pessoa", args: ["ver", "--", e.pessoa!] };
    if (e.acao === "ajustar") {
      opcao("elo", e.elo);
      opcao("nivel", e.nivel);
      opcao("data", e.data);
      return { comando: "pessoa", args: ["ajustar", ...opcoes, "--", e.pessoa!] };
    }
    if (e.acao === "visto") {
      opcao("filme", e.filme);
      opcao("nota", e.nota);
      opcao("fonte", e.fonte);
      opcao("data", e.data);
      return { comando: "pessoa", args: ["visto", ...opcoes, "--", e.pessoa!] };
    }

    opcao("filme", e.filme);
    opcao("entidade", e.entidade);
    opcao("data", e.data);
    if (e.acao !== "vetar") {
      opcao("reacao", e.reacao);
      opcao("fonte", e.fonte);
      if (e.especificidade) opcoes.push(`--${e.especificidade}`);
      if (e.review && e.acao === "declarar") opcoes.push("--review");
    }
    return { comando: "pessoa", args: [e.acao, ...opcoes, "--", e.pessoa!, e.texto!] };
  },
});
