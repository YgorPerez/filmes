import type { LoginRefusal } from '#/content/login-refusal'

export const LOGIN = {
  brand: 'filmes',
  title: 'Entrar',
  /** The shelf label over the card: what the site is for, before the
   * visitor has to know anything else. */
  tagline: ['Filme pra hoje', 'Pra sala toda'],
  taglineLabel: 'Filme pra hoje, pra sala toda.',
  /** What the visitor gets, not the button again. */
  lead: 'Sua lista da noite e as suas Sessões ficam aqui.',
  /** Who gets in, before a failed trip to Google says it. */
  access:
    'Só entra quem já está em Pessoas como Dono. Peça a quem já usa para pôr o seu e-mail.',
  google: 'Entrar com Google',
  otherAccount: 'Usar outra conta Google',
  refusals: {
    'nao-dono':
      'Este e-mail do Google não tem acesso ao filmes. Entre com outra conta, ou peça a quem já entra no filmes para dar acesso a este e-mail na sua página em Pessoas.',
    expirou: 'Este pedido para entrar venceu ou já foi usado. Entre de novo.',
    google: 'O Google não confirmou sua entrada. Tente de novo.',
    indisponivel: 'A entrada com Google está indisponível. Tente mais tarde.',
  } satisfies Record<LoginRefusal, string>,
} as const
