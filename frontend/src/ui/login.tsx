import type { LoginRefusal } from '#/content/login-refusal'
import {
  TRAKT_CONNECT,
  TRAKT_DISCONNECT,
  type TraktError,
} from '#/content/trakt-form'
import { LOGIN } from './login.copy'
import { Alert } from './kit/status'
import { buttonVariants } from './kit/button-variants'
import { SiteFooter } from './kit/site-footer'
import { Slip } from './kit/slip'
import { Button } from './shadcn/button'

// The pages without a Dono, so outside the app shell: `/entrar` and `/trakt`.
//
// `/entrar`: the case-black bar with "filmes" and one card with the one
// orange button. The button is a link, since `/auth/google` answers a GET with the
// redirect to Google; it goes when sign-in is off here, since Google
// would only send the visitor back. Both pages end with the footer that
// links the sources' credits.

export function Login({ refusal }: { refusal?: LoginRefusal }) {
  const googleLabel = refusal === 'nao-dono' ? LOGIN.otherAccount : LOGIN.google

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-case">
        <p className="mx-auto flex min-h-[56px] max-w-[1040px] items-center px-2xl font-display text-brand text-case-ink">
          {LOGIN.brand}
        </p>
      </header>
      <main className="mx-auto w-full max-w-[464px] px-2xl pt-14 pb-3xl sm:pt-24">
        <section
          aria-labelledby="entrar"
          className="overflow-hidden rounded-panel"
        >
          <div className="bg-case p-xs">
            <h1
              id="entrar"
              className="rounded-cover bg-shelf-label px-lg py-sm font-display text-counter-title text-on-sticker"
            >
              {LOGIN.title}
            </h1>
          </div>
          <div className="flex flex-col gap-2xl bg-card-stock p-2xl text-card-stock-ink sm:p-3xl">
            {refusal ? (
              <Alert className="bg-surface text-evidence">
                {LOGIN.refusals[refusal]}
              </Alert>
            ) : (
              <p className="text-pretty">{LOGIN.lead}</p>
            )}
            {refusal !== 'indisponivel' && (
              <a
                href="/auth/google"
                className={buttonVariants({ className: 'sm:self-start' })}
              >
                {googleLabel}
              </a>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}

// `/trakt` (#295): any Pessoa with an email signs in with Google, consents
// and connects her own Trakt, or disconnects it.

const traktErrors: Record<TraktError, string> = {
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
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto flex w-full max-w-[720px] flex-col gap-xl px-2xl py-3xl">
        <h1 className="font-display text-counter-title">Trakt</h1>
        {error && <Alert>{traktErrors[error]}</Alert>}
        <Slip id="trakt-history" title="Histórico e notas">
          <div className="flex flex-col items-start gap-lg">
            {page.status === 'unavailable' ? (
              <p>A conexão com o Trakt está indisponível.</p>
            ) : page.status === 'login' ? (
              <>
                <p>
                  Entre com o e-mail cadastrado no filmes para conectar sua
                  conta do Trakt.
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
                      Sua conta está conectada. Ao desconectar, o filmes deixa
                      de enviar seus filmes e apaga os dados de acesso. Seu
                      histórico no Trakt fica como está.
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
                      Autorizo o filmes a enviar ao meu Trakt o filme escolhido
                      na Sessão, os filmes marcados como Já vi no Cartaz e as
                      notas que dei. O envio acontece ao salvar o Feedback.
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
      <SiteFooter />
    </div>
  )
}
