// The Trakt section of a Pessoa's import page (#269).

export const TRAKT_SYNC = {
  title: 'Do Trakt',
  /** Her own page, her account connected. */
  connected:
    'Sua conta do Trakt está conectada: o filmes lê o histórico, as notas e a watchlist a cada Sessão nova.',
  /** Her own page, not connected yet. */
  connect:
    'Conecte a sua conta do Trakt: o filmes lê o histórico e as notas, mesmo de perfil privado, a cada Sessão nova.',
  connectLink: 'Conectar o Trakt',
  manage: 'Gerenciar a conexão',
  /** Another Pessoa's page: only she can connect hers. */
  other: (name: string) =>
    `Pelo nome do perfil público de ${name} no Trakt, o filmes lê o histórico e as notas a cada Sessão nova. Perfil privado? Só ${name} pode conectar a própria conta, na página do Trakt do filmes.`,
  otherLink: 'Página do Trakt',
  ownUser: 'Ou pelo nome do perfil, se ele é público',
  user: 'Nome do perfil no Trakt',
  userHint: 'como em trakt.tv/users/nome',
  consent: (name: string) =>
    `${name} concordou que o filmes leia o perfil público do Trakt e guarde as notas`,
  read: 'Ler o perfil',
  otherUser: 'Ler outro perfil',
  /** The one tap once a profile or the account was read. */
  sync: 'Sincronizar agora',
  syncUser: (user: string) => `Sincronizar agora (${user})`,
  busy: 'Lendo o Trakt…',
} as const
