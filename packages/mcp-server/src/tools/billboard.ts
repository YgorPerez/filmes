import { billboard } from '@filmes/engine'
import { z } from 'zod'
import { billboardViewTool } from '../billboard-view.ts'
import { defineTool, imdbId, sessionId } from '../tool.ts'

export default defineTool({
  name: 'billboard',
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  },
  description:
    'O Cartaz da Recomendação gravada numa Sessão, como dados: `billboard` traz o topo (`request.who` e `request.parts`, ' +
    'a leitura do pedido), os Presentes (`attendees`, com "Você" para o Dono), o que saiu na versão (`dropped`, com `reason`) e um card ' +
    'por filme em `films` (position, title, originalTitle, poster, imdbRatingText, votesText, chips, synopsis, `new` para o selo "novo", ' +
    '`lines` com a Evidência mais forte de cada Presente, `coverage` e `predictedRatings`, a Nota prevista de 1 a 10 de cada Presente que tem uma, ' +
    'como a versão gravou; numa Sessão com Feedback, o Filme escolhido traz `reactions`, a Nota prevista gravada de cada Presente ao lado da nota (de 1 a 10) ou do Relato dela; se nenhum card mostra o Filme escolhido (fora da Recomendação ou fora de `films`), ele vem em `chosen`, com id, title, year e as mesmas `reactions`). Com `films`, o Cartaz traz só esses, na ordem dada e ' +
    'numerados de 1 em diante, e a Sessão guarda a lista como mostrada, para o Feedback registrar a posição do Filme escolhido nela. ' +
    'O Cartaz responde: em cada filme, Já vi (por Presente, com nota de 1 a 10 e o que achou), Trocar, estrelas e comentário; ' +
    'embaixo, o acrescentar. O texto que volta começa com `#cartaz <sessao> v<n>` e vai para `answer_billboard`. ' +
    'Devolve também `session`, `films` (quantos cards) e `warnings`. ' +
    'Ao apresentar o Cartaz no chat, a linha de cada filme cita o `text` de `predictedRatings`, na ordem de `attendees`: ' +
    '"Fronteira (2008) — previsto: Ana 8,3, Bruno 7,1", com "Você" para o Dono; Presente sem Nota prevista fica fora da lista, ' +
    'e filme sem nenhuma não tem "previsto". ' +
    'Onde o app mostra telas (MCP Apps), o resultado aparece como o Cartaz (`ui://filmes/cartaz.html`): o Dono marca ali, e o Enviar ' +
    'grava a resposta com `answer_billboard` sem passar por você e, se algo caiu ou veio texto livre, manda uma mensagem que começa com ' +
    '`Enviei o Cartaz <sessao> v<n> pela tela`.',
  input: z.object({
    session: sessionId('ID da Sessão, o session.id que recommend devolveu'),
    films: z
      .array(imdbId)
      .min(1)
      .optional()
      .describe(
        'IDs do IMDb dos filmes que vão para a tela, na ordem da tela; sem ele, todos os da Recomendação',
      ),
  }),
  meta: billboardViewTool,
  run: ({ session, films }) =>
    billboard({ session, ...(films !== undefined && { shown: films }) }),
})
