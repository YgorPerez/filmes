import type { LoginRefusal } from '#/content/login-refusal'

export const LOGIN = {
  title: 'Entrar no filmes',
  lead: 'Use a conta Google que está no seu cadastro de Dono.',
  google: 'Entrar com Google',
  refusals: {
    'nao-dono':
      'Este e-mail do Google não é de um Dono do filmes. Entre com a conta que está no seu cadastro, ou peça para pôr este e-mail nele.',
    expirou: 'O login demorou demais ou já foi usado. Tente de novo.',
    google: 'O Google não confirmou o login. Tente de novo.',
    indisponivel: 'O login ainda não está ligado neste servidor.',
  } satisfies Record<LoginRefusal, string>,
} as const
