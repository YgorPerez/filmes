export const SHELL = {
  brand: 'filmes',
  home: 'filmes, início',
  tabs: 'Seções',
  items: {
    home: 'Início',
    sessions: 'Sessões',
    people: 'Pessoas',
    taste: 'Meu gosto',
  },
  account: (name: string) => `Sua conta: ${name}`,
  signedInAs: 'Entrou com',
  menu: 'Conta',
  operations: 'Operações',
  /** Beside Operações in the 240px menu: only "falhando" shows, so the row
   * fits one line at 390; "envio" is read aloud. */
  pushFailing: { hidden: 'envio ', shown: 'falhando' },
  logout: 'Sair',
} as const
