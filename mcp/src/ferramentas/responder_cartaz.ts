import { z } from "zod";
import { definirFerramenta } from "../ferramenta.ts";

export default definirFerramenta({
  nome: "responder_cartaz",
  descricao:
    "Lê o texto que o Dono colou do cartaz (o do botão Copiar pro chat, que começa com `#cartaz <sessao> v<n>`; " +
    "pode vir com conversa em volta) e grava: cada Já vi vira Já visto da Pessoa e, com nota de 1 a 10, Nota " +
    "(metade do número); \"todos\" são os Presentes da versão. Estrelas, comentários e o acrescentar ficam na " +
    "versão da Sessão e não mexem no gosto. Texto de versão velha vale pelo filme; o Trocar de um filme que já " +
    "saiu da tela é ignorado, com aviso. Sessão errada ou texto que não é de cartaz é erro uso_invalido. " +
    "Devolve `regerar` (verdadeiro se algum filme caiu, por Já visto ou Trocar, ou se veio acrescentar), " +
    "`manter` (IDs que ficam, na ordem da tela), `saem` ({posicao, id, titulo, motivo: ja_visto|trocado, " +
    "pessoas?}), `acrescentar` e `comentarios` ({posicao, id, titulo, comentario}) como vieram, `estrelas`, " +
    "`vistos` ({pessoa, filme, titulo, nota, novo}), `versao`, `versao_atual` e `avisos`. " +
    "Com `regerar`, refaça com recomendar (sessao, manter) e um pedido montado do acrescentar; " +
    "o texto livre não é interpretado aqui.",
  entrada: {
    sessao: z.string().min(1).describe("ID da Sessão do cartaz"),
    texto: z.string().min(1).describe("o texto colado pelo Dono, como veio"),
  },
  cli: ({ sessao, texto }) => ({
    comando: "cartaz",
    args: ["responder", `--sessao=${sessao}`],
    stdin: texto,
  }),
});
