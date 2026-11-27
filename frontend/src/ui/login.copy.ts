import type { LoginRefusal } from '#/content/login-refusal'
import type { TraktError } from '#/content/trakt-form'

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

/** `/trakt` (#295): a Pessoa connects her own Trakt, or disconnects it. */
export const TRAKT_SCREEN = {
  title: 'Trakt',
  slip: 'Histórico e notas',
  unavailable: 'A conexão com o Trakt está indisponível.',
  login:
    'Entre com o e-mail cadastrado no filmes para conectar sua conta do Trakt.',
  google: 'Entrar com Google',
  connected:
    'Sua conta está conectada. Ao desconectar, o filmes deixa de enviar seus filmes e apaga os dados de acesso. Seu histórico no Trakt fica como está.',
  disconnect: 'Desconectar Trakt',
  consent:
    'Autorizo o filmes a enviar ao meu Trakt o filme escolhido na Sessão, os filmes marcados como Já vi no Cartaz e as notas que dei. O envio acontece ao salvar o Feedback.',
  connect: 'Conectar Trakt',
  notice: 'O filmes usa o Trakt e não é endossado nem certificado pelo Trakt.',
  errors: {
    login: 'Entre com o e-mail cadastrado no filmes.',
    trakt: 'O Trakt não concluiu a conexão. Tente de novo.',
    consentimento: 'Marque a caixa para autorizar o envio ao Trakt.',
  } satisfies Record<TraktError, string>,
} as const
