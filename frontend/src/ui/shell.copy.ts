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
  pushFailing: 'envio falhando',
  logout: 'Sair',
} as const
