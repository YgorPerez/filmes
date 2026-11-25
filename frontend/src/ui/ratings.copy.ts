import type { RatingRefusal } from '#/content/rating-form'

const notas = (n: number) => (n === 1 ? '1 Nota' : `${n} Notas`)

export const RATINGS = {
  back: 'Voltar',
  title: 'Meu gosto',
  lead: 'Dê uma Nota de 1 a 10 aos filmes que você viu; os que não viu, pule. As Notas ficam neste navegador até você tocar em Pronto, e aí vão todas de uma vez para o seu gosto.',
  unavailable:
    'A tela de notas não está pronta neste servidor: falta o banco do filmes.',
  queueLabel: 'Filme para dar Nota',
  rate: (n: number) => `Nota ${n}`,
  notSeen: 'Não vi',
  over: 'Acabou a fila. Busque um filme pelo título para dar mais Notas.',
  draft: 'Suas Notas',
  draftLead: 'Ainda não gravadas: toque em Pronto para gravar.',
  empty: 'Nenhuma Nota ainda.',
  remove: (title: string) => `Tirar a Nota de ${title}`,
  removeLabel: 'Tirar',
  done: (n: number) => (n === 0 ? 'Pronto' : `Pronto (${notas(n)})`),
  written: (n: number) =>
    n === 0
      ? 'Nada novo: você já tinha essas Notas.'
      : `${notas(n)} gravada${n === 1 ? '' : 's'} no seu gosto.`,
  refusals: {
    pedido:
      'Algo no pedido veio errado: as Notas continuam aqui. Tente de novo.',
    alvo: 'Um dos filmes não está no Catálogo: tire-o e tente de novo.',
    indisponivel:
      'Não deu para gravar agora: as Notas continuam aqui. Tente de novo mais tarde.',
  } satisfies Record<RatingRefusal, string>,
}
