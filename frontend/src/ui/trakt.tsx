import {
  TRAKT_CONNECT,
  TRAKT_DISCONNECT,
  type TraktError,
} from '#/content/trakt-form'
import { Alert } from './kit/status'
import { Slip } from './kit/slip'
import { buttonVariants } from './kit/button-variants'
import { Button } from './shadcn/button'

const errors: Record<TraktError, string> = {
  login: 'Entre com o e-mail cadastrado no filmes.',
  trakt: 'O Trakt não concluiu a conexão. Tente de novo.',
  consentimento: 'Marque a caixa para autorizar o envio ao Trakt.',
}

type TraktPage =
  | { status: 'unavailable' }
  | { status: 'login' }
  | { status: 'connected' | 'disconnected'; name: string }

export function TraktScreen({
  page,
  error,
}: {
  page: TraktPage
  error?: TraktError
}) {
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-xl px-2xl py-3xl">
      <h1 className="font-display text-counter-title">Trakt</h1>
      {error && <Alert>{errors[error]}</Alert>}
      <Slip id="trakt-history" title="Histórico e notas">
        <div className="flex flex-col items-start gap-lg">
          {page.status === 'unavailable' ? (
            <p>A conexão com o Trakt está indisponível.</p>
          ) : page.status === 'login' ? (
            <>
              <p>
                Entre com o e-mail cadastrado no filmes para conectar sua conta
                do Trakt.
              </p>
              <a
                href="/auth/trakt-google"
                className={buttonVariants({ variant: 'primary' })}
              >
                Entrar com Google
              </a>
            </>
          ) : (
            <>
              <p className="font-semibold">{page.name}</p>
              {page.status === 'connected' ? (
                <>
                  <p>
                    Sua conta está conectada. Ao desconectar, o filmes deixa de
                    enviar seus filmes e apaga os dados de acesso. Seu histórico
                    no Trakt fica como está.
                  </p>
                  <form action={TRAKT_DISCONNECT} method="post">
                    <Button type="submit" variant="option">
                      Desconectar Trakt
                    </Button>
                  </form>
                </>
              ) : (
                <form
                  action={TRAKT_CONNECT}
                  method="post"
                  className="flex flex-col items-start gap-lg"
                >
                  <label className="flex items-start gap-sm">
                    <input
                      type="checkbox"
                      name="consentir"
                      value="sim"
                      required
                      className="mt-1"
                    />
                    Autorizo o filmes a enviar ao meu Trakt o filme escolhido na
                    Sessão, os filmes marcados como Já vi no Cartaz e as notas
                    que dei. O envio acontece ao salvar o Feedback.
                  </label>
                  <Button type="submit">Conectar Trakt</Button>
                </form>
              )}
            </>
          )}
        </div>
      </Slip>
      <p className="text-meta text-ink-2">
        O filmes usa o Trakt e não é endossado nem certificado pelo Trakt.
      </p>
    </main>
  )
}
