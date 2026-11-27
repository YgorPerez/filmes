export const LOST = {
  brand: 'filmes',
  home: 'filmes, início',
  notFound: {
    title: 'Essa fita não está na prateleira',
    lead: 'O endereço pode ter mudado, ou a Sessão foi apagada.',
    home: 'Ir para o início',
    sessions: 'Ver Sessões',
  },
  /** Logged out: no Sessão to have lost, and Entrar is the way in. */
  notFoundAlone: {
    lead: 'O endereço pode ter mudado, ou veio cortado.',
    signIn: 'Entrar',
  },
  sessionNotFound: {
    title: 'Essa Sessão não está na prateleira',
    lead: 'Ela pode ter sido apagada, ou o endereço veio cortado. As outras continuam em Sessões.',
    home: 'Ir para o início',
    sessions: 'Ver todas as Sessões',
  },
  error: {
    title: 'A fita enroscou',
    lead: 'Esta página não abriu: o site teve um problema, e ele ficou registrado no log do servidor. Tente de novo; se continuar, volte ao início.',
    retry: 'Tentar de novo',
    home: 'Ir para o início',
  },
} as const
