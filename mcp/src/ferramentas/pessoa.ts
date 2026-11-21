import { z } from "zod";
import { definirFerramenta } from "../ferramenta.ts";

const semHifen = (o_que: string) => z.string().regex(/^[^-\s]/, `${o_que} não pode começar com '-' nem espaço`);

const PRECISA: Record<string, string[]> = {
  criar: ["nome"],
  ver: ["pessoa"],
  declarar: ["pessoa", "texto"],
  relatar: ["pessoa", "texto"],
  vetar: ["pessoa", "texto"],
};

export default definirFerramenta({
  nome: "pessoa",
  descricao:
    "Pessoas no repo de dados. criar: nome, apelidos, slug, dono. ver: tudo o que se sabe da Pessoa " +
    "(Vetos, Declarados, Relatos com Força, Notas). declarar: o que a própria Pessoa disse do gosto dela; " +
    "relatar: o que o Dono sabe do gosto de outra Pessoa; vetar: um tipo de filme que ela nunca vê. " +
    "Alvo por ID do Catálogo (filme tt..., entidade Q... de diretor, ator ou gênero; ache com consultar). " +
    "Sobre um filme, reacao ama vira Nota 5 e odeia vira Nota 1. Sem alvo, o texto fica guardado mas não muda a ordem. " +
    "Um Veto precisa de alvo. O que se grava vale já na próxima Recomendação.",
  entrada: {
    acao: z.enum(["criar", "ver", "declarar", "relatar", "vetar"]),
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
    review: z.boolean().optional().describe("declarar: é review ou tag que a própria Pessoa escreveu"),
    fonte: semHifen("fonte").optional().describe('declarar, relatar: de onde veio, ex.: "questionário"'),
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("AAAA-MM-DD; padrão hoje"),
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
    if (e.acao === "ver") return { comando: "pessoa", args: ["ver", "--", e.pessoa!] };

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
