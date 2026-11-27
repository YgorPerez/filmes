import type { LoginRefusal } from '#/content/login-refusal'
import type { TraktError } from '#/content/trakt-form'

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
  /** Sign-in is off on this server: the quiet way to try it again. */
  retry: 'Tentar de novo',
  refusals: {
    'nao-dono':
      'Este e-mail do Google não tem acesso ao filmes. Entre com outra conta, ou peça a quem já entra no filmes para dar acesso a este e-mail na sua página em Pessoas.',
    expirou: 'Este pedido para entrar venceu ou já foi usado. Entre de novo.',
    google: 'O Google não confirmou sua entrada. Tente de novo.',
    indisponivel: 'A entrada com Google está indisponível. Tente mais tarde.',
  } satisfies Record<LoginRefusal, string>,
} as const

/** `/trakt` (#295, #269, #274): a Pessoa connects her own Trakt, which the
 * filmes reads and sends to, or disconnects it. */
export const TRAKT_SCREEN = {
  heading: 'Trakt',
  back: 'Importar',
  title: 'Histórico e notas',
  google: 'Entrar com Google',
  disconnect: 'Desconectar Trakt',
  connect: 'Conectar Trakt',
  unavailable: 'A conexão com o Trakt está indisponível.',
  login:
    'Entre com o e-mail cadastrado no filmes para conectar sua conta do Trakt.',
  connected:
    'Sua conta está conectada: o filmes lê seu histórico a cada Sessão nova e envia o filme escolhido. Ao desconectar, ele deixa de ler e de enviar e apaga os dados de acesso. O que já entrou no seu gosto e seu histórico no Trakt ficam como estão.',
  does: [
    {
      title: 'O filmes lê do seu Trakt',
      items: [
        'o histórico, as notas e a watchlist de filmes',
        'a cada Sessão nova, e quando você pedir em Importar',
      ],
    },
    {
      title: 'O filmes envia ao seu Trakt, ao salvar o Feedback',
      items: [
        'o filme escolhido na Sessão',
        'os filmes marcados como Já vi no Cartaz, com as notas que você deu',
      ],
    },
  ],
  consent: 'Autorizo a leitura e o envio acima',
  after:
    'O Trakt pede que você entre e aprove. Depois você volta para esta página com a conta conectada, e o histórico entra na próxima Sessão.',
  notEndorsed:
    'O filmes usa o Trakt e não é endossado nem certificado pelo Trakt.',
  errors: {
    login: 'Entre com o e-mail cadastrado no filmes.',
    trakt: 'O Trakt não concluiu a conexão. Tente de novo.',
    consentimento:
      'Marque a caixa para autorizar a leitura e o envio ao Trakt.',
  } satisfies Record<TraktError, string>,
} as const
