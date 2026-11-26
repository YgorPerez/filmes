import type { RatingRefusal } from '#/content/rating-form'

const notas = (n: number) => (n === 1 ? '1 Nota' : `${n} Notas`)

export const RATINGS = {
  back: 'Meu gosto',
  title: 'Meu gosto',
  lead: 'Dê uma Nota de 1 a 10 aos filmes que você viu; os que não viu, pule. As Notas ficam neste navegador até você tocar em Pronto, e aí vão todas de uma vez para o seu gosto.',
  unavailable:
    'Não deu para abrir a tela de notas: o site está com um problema, e ele ficou registrado no log do servidor.',
  queueLabel: 'Filme para dar Nota',
  rate: (n: number) => `Nota ${n}`,
  scale: 'Nota de 1 a 10',
  scaleLow: '1 · não gostei',
  scaleHigh: 'adorei · 10',
  notSeen: 'Não vi',
  over: 'Acabou a fila. Busque um filme pelo título para dar mais Notas.',
  draft: 'Suas Notas',
  draftLead: 'Ainda não gravadas: toque em Pronto para gravar.',
  empty: 'Nenhuma Nota ainda.',
  remove: (title: string) => `Tirar a Nota de ${title}`,
  removeLabel: 'Tirar',
  done: (n: number) => (n === 0 ? 'Pronto' : `Pronto (${notas(n)})`),
  /** Pronto while its post runs. */
  writing: 'Gravando…',
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
    falha:
      'O site está com um problema, e ele ficou registrado no log do servidor. Tentar de novo não resolve.',
  } satisfies Record<RatingRefusal, string>,
}
