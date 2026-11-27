import {
  SEARCH_KINDS,
  SEARCH_LIMIT,
  SEARCH_LIMIT_MAX,
  searchCatalog,
} from '@filmes/engine'
import { z } from 'zod'
import { defineTool } from '../tool.ts'

export default defineTool({
  name: 'search_catalog',
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
  session: true,
  description:
    'Busca no Catálogo pelo nome, sem ligar para acento nem maiúscula, e devolve os IDs que as outras ferramentas ' +
    'pedem: `films` ({id tt..., title, year, votes, rating, directors}), `people` (diretor, roteirista, ator), ' +
    '`genres` e `series` ({id Q..., label, links, filmCount, knownFor: os dois filmes mais votados}). O nome inteiro ' +
    'vem antes, depois o começo do nome, depois o começo de uma palavra; entre iguais, o mais votado. "Título (ano)" ' +
    'filtra pelo ano; um tt... ou Q... acha esse ID. Serve a qualquer Pessoa: o tt... vai no `similar` da ' +
    'Recomendação, no Já visto e no Feedback, e o Q... é o alvo de Declarado, Veto e Ajuste em `person`.',
  input: z.object({
    query: z
      .string()
      .trim()
      .min(1)
      .describe(
        'o título ou o nome, como o Dono escreveu; "Título (ano)" para um ano só',
      ),
    kinds: z
      .array(z.enum(SEARCH_KINDS))
      .optional()
      .describe('film, person, genre, series; sem isto, todos'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(SEARCH_LIMIT_MAX)
      .optional()
      .describe(
        `quantos de cada tipo, até ${SEARCH_LIMIT_MAX} (padrão ${SEARCH_LIMIT})`,
      ),
  }),
  run: ({ query, kinds, limit }) =>
    searchCatalog({
      query,
      ...(kinds === undefined ? {} : { kinds }),
      ...(limit === undefined ? {} : { limit }),
    }),
})
