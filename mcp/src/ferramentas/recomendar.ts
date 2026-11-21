import { z } from "zod";
import { definirFerramenta } from "../ferramenta.ts";

const pessoa = z.string().regex(/^[^-\s]/, "nome de Pessoa não pode começar com '-' nem espaço");

export default definirFerramenta({
  nome: "recomendar",
  descricao:
    "Recomendação para uma Sessão: devolve o top 5 na ordem da Regra de escolha. Cada filme traz " +
    "`utilidade` (0 a 1, ou null quando não há Fato) e `evidencias` agrupadas por Presente " +
    "(pessoa, texto, fonte, data, forca, tipo, fato_id, contribuicao); quem não tem Fato sobre o filme " +
    'recebe a linha "sem fato". `so_palpites` marca filme sem Fato nenhum, que só entra no fim quando ' +
    'faltam Candidatos com Fato. Presentes por slug, nome ou apelido; "dono" é o Dono.',
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
    quantos: z.number().int().min(1).max(100).optional().describe("tamanho da lista; padrão 5"),
  },
  cli: ({ presentes, regra, de, quantos }) => ({
    comando: "recomendar",
    args: [
      "--presentes",
      ...presentes,
      ...(regra ? ["--regra", regra] : []),
      ...(de ? ["--de", de] : []),
      ...(quantos ? ["--quantos", String(quantos)] : []),
    ],
  }),
});
