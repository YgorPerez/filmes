import { HOME } from './home.copy'

// Meu gosto's part of the setup guide (#222): the connector's address, and
// the steps she skipped, which the home stops offering once no step is
// missing.
export const MY_START = {
  resume: HOME.guide.resume,
  copyAddress: HOME.guide.copyAddress,
  connector: {
    title: HOME.guide.steps.connector.title,
    lead: HOME.guide.steps.connector.text,
    state: { done: 'conectado', pending: 'falta conectar' },
    pending: HOME.guide.auto,
    done: 'O Claude já entra com o seu e-mail. Em outro aparelho, adicione o mesmo endereço.',
  },
  skipped: {
    title: 'Passos pulados',
    lead: 'Ficaram para depois no guia da home. Dá para retomar daqui.',
  },
} as const
