// The Trakt section of a Pessoa's import page (#269).

export const TRAKT_SYNC = {
  title: 'Do Trakt',
  /** Her own page, her account connected. */
  connected:
    'Sua conta do Trakt está conectada: o filmes lê o histórico, as notas e a watchlist a cada Sessão nova.',
  /** Her own page, not connected yet: the one way recommended (#274). */
  connect:
    'O melhor caminho: conecte a sua conta do Trakt. O filmes lê o histórico e as notas, mesmo de perfil privado, a cada Sessão nova.',
  /** Her own page, a public profile read, no account connected. */
  linkedOwn:
    'O filmes lê o seu perfil público do Trakt a cada Sessão nova. Conectar a conta lê também um perfil privado e envia o filme escolhido.',
  /** A server with no Trakt client id: the ZIP is the way. */
  zipOnly:
    'Baixe o ZIP dos dados no Trakt, pelo computador, e envie aqui como veio.',
  /** The ZIP, folded under the recommended way. */
  zip: 'Ou envie o ZIP do Trakt',
  connectLink: 'Conectar o Trakt',
  manage: 'Gerenciar a conexão',
  /** Another Pessoa's page: only she can connect hers, so no way to it
   * here (#274). */
  other: (name: string) =>
    `Pelo nome do perfil público de ${name} no Trakt, o filmes lê o histórico e as notas a cada Sessão nova. Perfil privado? Peça a ${name} para torná-lo público, ou envie o ZIP do Trakt dela.`,
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
