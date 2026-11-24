import type { ExportRefusal } from '#/content/export-refusal'

export const EXPORT = {
  back: 'Voltar',
  title: 'Exportar Notas',
  lead: 'Baixe as Notas de uma Pessoa no CSV de avaliações do IMDb. Vai a Nota mais recente de cada filme, de 1 a 10.',
  person: 'Pessoa',
  personHint: 'quantas Notas vão no arquivo',
  option: (name: string, ratings: number) =>
    `${name} · ${ratings === 0 ? 'nenhuma Nota' : ratings === 1 ? '1 Nota' : `${ratings} Notas`}`,
  download: 'Baixar CSV do IMDb',
  movielensTitle: 'Para levar ao MovieLens',
  movielens: [
    'Entre no movielens.org e abra Import or Export Data.',
    'Importe o arquivo baixado como avaliações do IMDb.',
    'O MovieLens converte a nota de 1 a 10 para as estrelas dele.',
  ],
  unavailable:
    'A exportação ainda não está pronta neste servidor: falta o banco do filmes.',
  refusals: {
    pessoa: 'Essa Pessoa não está mais no repo de dados. Escolha outra.',
    indisponivel:
      'Não deu para gerar o arquivo agora. Tente de novo daqui a pouco.',
  } satisfies Record<ExportRefusal, string>,
} as const
