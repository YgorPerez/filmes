import { EXPORT_FORMATS, exportRatings } from '@filmes/engine'
import { z } from 'zod'
import { asPerson, defineTool, personName } from '../tool.ts'
import { Effect } from 'effect'

export default defineTool({
  name: 'export',
  description:
    'As Notas de uma Pessoa no arquivo de outro serviço. format imdb: o CSV de avaliações do IMDb (a Nota vigente de ' +
    'cada filme, dobrada para 1 a 10), o único que o import do MovieLens aceita (movielens.org, Import or Export Data). ' +
    'Devolve o arquivo em `content` (texto UTF-8, para o Dono salvar como .csv), quantas Notas saíram (`ratings`) e ' +
    'quantas são de filme fora do Catálogo (`outsideCatalog`). No app, Exportar baixa o mesmo arquivo.',
  input: z.object({
    person: personName('slug, nome ou apelido da Pessoa; "dono" é o Dono'),
    format: z
      .enum(EXPORT_FORMATS)
      .describe('imdb: CSV de avaliações do IMDb, para importar no MovieLens'),
  }),
  run: ({ person, format }) =>
    Effect.flatMap(asPerson(person), (name) => exportRatings(name, format)),
})
