import { billboard } from '@filmes/engine'
import { z } from 'zod'
import { defineTool, imdbId, sessionId } from '../tool.ts'

export default defineTool({
  name: 'billboard',
  description:
    'O Cartaz da Recomendação gravada numa Sessão, como dados: `billboard` traz o topo (`request.who` e `request.parts`, ' +
    'a leitura do pedido), os Presentes (`attendees`, com "Você" para o Dono), o que saiu na versão (`dropped`, com `reason`) e um card ' +
    'por filme em `films` (position, title, originalTitle, poster, imdbRatingText, votesText, chips, synopsis, `new` para o selo "novo", ' +
    '`lines` com a Evidência mais forte de cada Presente e `coverage`). Com `films`, o Cartaz traz só esses, na ordem dada e ' +
    'numerados de 1 em diante, e a Sessão guarda a lista como mostrada, para o Feedback registrar a posição do Filme escolhido nela. ' +
    'O Cartaz responde: em cada filme, Já vi (por Presente, com nota de 1 a 10 e o que achou), Trocar, estrelas e comentário; ' +
    'embaixo, o acrescentar. O texto que volta começa com `#cartaz <sessao> v<n>` e vai para `answer_billboard`. ' +
    'Devolve também `session`, `films` (quantos cards) e `warnings`.',
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
  run: ({ session, films }) =>
    billboard({ session, ...(films !== undefined && { shown: films }) }),
})
