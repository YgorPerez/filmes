import { answerBillboard } from '@filmes/engine'
import { z } from 'zod'
import { defineTool, sessionId } from '../tool.ts'

export default defineTool({
  name: 'answer_billboard',
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  },
  session: true,
  description:
    'Lê o texto que o Dono mandou do Cartaz (o do botão Copiar pro chat ou Enviar, que começa com `#cartaz <sessao> v<n>`; ' +
    'pode vir com conversa em volta) e grava: cada Já vi vira Já visto da Pessoa e, com nota de 1 a 10, Nota ' +
    '(metade do número); o que cada Pessoa achou (`achou <slug>:`) vira Declarado específico dela sobre o filme, ' +
    'com reação pela nota; "todos" são os Presentes da versão. Estrelas, comentários e o acrescentar ficam na ' +
    'versão da Sessão e não mexem no gosto; comentário não troca filme, só o Trocar. Texto de versão velha vale pelo filme; ' +
    'o Trocar de um filme que já saiu da tela é ignorado, com aviso. Sessão errada ou texto que não é do Cartaz é erro invalid_usage, e nada é gravado. ' +
    'A linha `clima: <nome>, ...` (ou `clima: nenhum`) traz os Climas que o Dono marcou nos chips do Cartaz; ' +
    'quando diferem dos da versão atual, `moods` traz os novos (nome fora do vocabulário vira aviso), ' +
    '`regenerate` vem verdadeiro e `keep` vazio, porque outro Clima refaz a lista inteira. Sem mudança, `moods` é null. ' +
    'Devolve `regenerate` (verdadeiro se algum filme caiu, por Já vi ou Trocar, se veio acrescentar ou se o Clima mudou), ' +
    '`keep` (IDs que ficam, na ordem da tela), `dropped` ({position, id, title, cause: seen|swapped, people?}), ' +
    '`addition` e `comments` ({position, id, title, comment}) como vieram, `stars`, ' +
    '`seen` ({person, film, title, rating, new}), `version`, `currentVersion` e `warnings`. ' +
    'Com `regenerate`, refaça com recommend (session, keep, e `moods` quando não for null) e um pedido montado do acrescentar. ' +
    'No refazer, o motor lê os comentários do Cartaz e aplica Climas, Restrições e Parecido às vagas. ' +
    'O Enviar da tela do Cartaz chama esta ferramenta sozinho; a mensagem que termina com `(pelo Cartaz · v<n>)` ' +
    'já foi gravada: não chame de novo, refaça com o `manter` e o `clima` da `Resposta do Cartaz` que veio no seu contexto ' +
    '(sem ela, com os filmes do `billboard` que a mensagem não tirou).',
  input: z.object({
    session: sessionId('ID da Sessão do Cartaz'),
    text: z.string().min(1).describe('o texto do Cartaz, como veio'),
  }),
  run: answerBillboard,
})
