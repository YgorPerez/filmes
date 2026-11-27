import type { RatingRefusal } from '#/content/rating-form'

const notas = (n: number) => (n === 1 ? '1 Nota' : `${n} Notas`)

const minutes = (n: number) =>
  n < 60
    ? `${n} min`
    : `${Math.floor(n / 60)} h ${String(n % 60).padStart(2, '0')}`

export const RATINGS = {
  back: 'Meu gosto',
  title: 'Dar notas',
  lead: 'Dê nota aos que viu. Pule os que não viu. Toque em Pronto no fim.',
  unavailable:
    'Não deu para abrir a tela de Notas: o site está com um problema, e ele ficou registrado no log do servidor.',
  queueLabel: 'Filme para dar Nota',
  rate: (n: number) => `Nota ${n}`,
  scale: 'Nota de 1 a 10',
  scaleLow: '1 · não gostei',
  scaleHigh: 'adorei · 10',
  notSeen: 'Não vi',
  /** The film on the card, in words. */
  original: (title: string) => `Título original: ${title}`,
  directedBy: (names: readonly string[]) => `Direção: ${names.join(', ')}`,
  runtime: minutes,
  poster: (title: string) => `Cartaz de ${title}`,
  /** The line of the last tap, with its undo. */
  lastRated: (title: string) => title,
  lastSkipped: (title: string) => `Não vi ${title}`,
  undo: 'Voltar ao anterior',
  undoLabel: (title: string) => `Voltar a ${title}`,
  /** What a screen reader hears after a tap. */
  announceRated: (rating: number, title: string, next: string | null) =>
    `Nota ${rating} para ${title}.${next ? ` Próximo: ${next}.` : ''}`,
  announceSkipped: (title: string, next: string | null) =>
    `${title} pulado.${next ? ` Próximo: ${next}.` : ''}`,
  announceUndone: (title: string) => `De volta a ${title}.`,
  over: 'Acabou a fila. Busque um filme pelo título para dar mais Notas.',
  /** The bar: how many she has, toward the goal until she reaches it. */
  progress: (n: number, goal: number) =>
    n < goal ? `${n} de ${goal} Notas` : notas(n),
  progressLabel: (n: number, goal: number) =>
    n < goal
      ? `${notas(n)} de ${goal}, contando as que ainda não foram gravadas`
      : `${notas(n)}, contando as que ainda não foram gravadas`,
  bar: 'Suas Notas desta vez',
  /** The goal reached: the card waits behind "Continuar dando notas". */
  goal: (goal: number) => `${goal} Notas. Já dá pra pedir filme.`,
  goalLead:
    'Toque em Pronto para gravar as que faltam. Quanto mais Notas, melhor a escolha.',
  more: 'Continuar dando notas',
  ask: 'Pedir filme',
  draft: 'Ainda não gravadas',
  remove: (title: string) => `Tirar a Nota de ${title}`,
  removeLabel: 'Tirar',
  done: (n: number) => (n === 0 ? 'Pronto' : `Pronto · ${n}`),
  doneLabel: (n: number) => (n === 0 ? 'Pronto' : `Pronto: gravar ${notas(n)}`),
  /** Pronto with nothing to send. */
  nothing: 'Dê nota a pelo menos um filme.',
  /** Pronto while its post runs. */
  writing: 'Gravando…',
  written: (n: number) =>
    n === 0
      ? 'Nada novo: você já tinha essas Notas.'
      : `${notas(n)} gravada${n === 1 ? '' : 's'} no seu gosto.`,
  /** After Pronto, in the hand note. */
  writtenNext: 'Pronto, já dá pra pedir filme.',
  moreRatings: 'Dar mais notas',
  /** The search under the card. */
  searchLead: 'Não está na fila? Busque pelo título e dê nota direto.',
  pick: 'Dar nota',
  pickLabel: (title: string) => `Dar nota a ${title}`,
  /** A film she already gave a Nota (#274). */
  yourRating: (rating: number) => `sua nota ${rating}`,
  change: 'Mudar',
  changeLabel: (title: string) => `Mudar a Nota de ${title}`,
  ratedNow: (rating: number) =>
    `Sua nota: ${rating}. Toque em outra para mudar.`,
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
