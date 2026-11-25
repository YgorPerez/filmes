import { answerBillboard } from '@filmes/engine'
import { z } from 'zod'
import { defineTool, sessionId } from '../tool.ts'

export default defineTool({
  name: 'answer_billboard',
  description:
    'Lê o texto que o Dono mandou do Cartaz (o do botão Copiar pro chat ou Enviar, que começa com `#cartaz <sessao> v<n>`; ' +
    'pode vir com conversa em volta) e grava: cada Já vi vira Já visto da Pessoa e, com nota de 1 a 10, Nota ' +
    '(metade do número); o que cada Pessoa achou (`achou <slug>:`) vira Declarado específico dela sobre o filme, ' +
    'com reação pela nota; "todos" são os Presentes da versão. Estrelas, comentários e o acrescentar ficam na ' +
    'versão da Sessão e não mexem no gosto; comentário não troca filme, só o Trocar. Texto de versão velha vale pelo filme; ' +
    'o Trocar de um filme que já saiu da tela é ignorado, com aviso. Sessão errada ou texto que não é do Cartaz é erro invalid_usage, e nada é gravado. ' +
    'Devolve `regenerate` (verdadeiro se algum filme caiu, por Já vi ou Trocar, ou se veio acrescentar), ' +
    '`keep` (IDs que ficam, na ordem da tela), `dropped` ({position, id, title, cause: seen|swapped, people?}), ' +
    '`addition` e `comments` ({position, id, title, comment}) como vieram, `stars`, ' +
    '`seen` ({person, film, title, rating, new}), `version`, `currentVersion` e `warnings`. ' +
    'Com `regenerate`, refaça com recommend (session, keep) e um pedido montado do acrescentar; ' +
    'o texto livre não é interpretado aqui.',
  input: z.object({
    session: sessionId('ID da Sessão do Cartaz'),
    text: z.string().min(1).describe('o texto do Cartaz, como veio'),
  }),
  run: answerBillboard,
})
