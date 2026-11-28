import type { SessionEditRefusal } from '#/content/session-edit'
import { SESSIONS } from './sessions.copy'

/** The edit form of an open Session (#372). */
export const SESSION_EDIT = {
  back: 'Voltar para a Sessão',
  title: 'Editar o pedido',
  label: 'Editar o pedido da Sessão',
  lead: 'Os filmes que ainda passam ficam no número; os que não passam saem e o lugar é preenchido. Um Clima novo troca a lista inteira.',
  /** In the head's ⋯ menu of an open Session. */
  menu: 'Editar pedido',
  words: 'O pedido',
  wordsHint: 'opcional. As palavras ficam guardadas com a Sessão.',
  submit: 'Salvar e refazer',
  submitting: 'Refazendo…',
  unknown: 'Não encontrei essa Sessão.',
  closed:
    'Esta Sessão já foi contada: o pedido dela não muda mais. Para mudar quem estava, use Corrigir o que contei.',
  absent: 'Só quem estava na Sessão edita o pedido dela.',
  refusals: {
    ...SESSIONS.refusals,
    fechada:
      'Esta Sessão foi contada enquanto você editava: o pedido dela não muda mais.',
    ausente: 'Só quem estava na Sessão edita o pedido dela.',
  } satisfies Record<SessionEditRefusal, string>,
}
