import { EXPORT_FORMATS, exportRatings } from '@filmes/engine'
import { z } from 'zod'
import { defineTool, personName } from '../tool.ts'

export default defineTool({
  name: 'export',
  description:
    'As Notas de uma Pessoa no arquivo de outro serviço. format imdb: o CSV de avaliações do IMDb (a Nota vigente de ' +
    'cada filme, dobrada para 1 a 10), o único que o import do MovieLens aceita (movielens.org, Import or Export Data). ' +
    'format letterboxd: o CSV que o import do Letterboxd lê (letterboxd.com/about/importing-data), para o diário dela: um filme por ' +
    'linha, com a Nota vigente (do import, do Feedback, do Cartaz ou da conversa) em 1 a 10, ou em branco se só há Já ' +
    'visto, e a data em que viu por último. Devolve o arquivo em `content` (texto UTF-8, para o Dono salvar como .csv), ' +
    'quantas Notas saíram (`ratings`) e quantos filmes são de fora do Catálogo (`outsideCatalog`). No app, a seção ' +
    'Notas da página da Pessoa baixa os mesmos arquivos.',
  input: z.object({
    person: personName('slug, nome ou apelido da Pessoa; "dono" é o Dono'),
    format: z
      .enum(EXPORT_FORMATS)
      .describe(
        'imdb: CSV de avaliações do IMDb, para importar no MovieLens; letterboxd: CSV para importar no Letterboxd',
      ),
  }),
  run: ({ person, format }) => exportRatings(person, format),
})
