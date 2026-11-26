import type { LoginRefusal } from '#/content/login-refusal'

export const LOGIN = {
  brand: 'filmes',
  title: 'Entrar no filmes',
  lead: 'Entre com a conta Google que tem acesso ao filmes.',
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
