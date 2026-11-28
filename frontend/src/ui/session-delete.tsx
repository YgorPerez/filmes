import { useId, useRef } from 'react'
import { buttonVariants } from './kit/button-variants'
import { useFetchForm } from './kit/fetch-form'
import { Icon } from './kit/icon'
import { MENU_ROW } from './kit/menu-row'
import { PostFailed } from './kit/status'

/** `action`, where the form posts (`sessionDeletePath`). */
export function SessionDelete({
  action,
  hasFacts,
}: {
  action: string
  hasFacts: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useId()
  const description = useId()
  const { onSubmit, busy, failed } = useFetchForm()
  return (
    <>
      <button
        type="button"
        className={MENU_ROW}
        onClick={() => dialog.current?.showModal()}
      >
        <Icon name="close" />
        Excluir
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={heading}
        aria-describedby={description}
        className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-[460px] rounded-panel border border-rule bg-surface p-xl text-ink backdrop:bg-black/50"
      >
        <form
          method="post"
          action={action}
          onSubmit={onSubmit}
          className="flex flex-col gap-lg"
        >
          <h2 id={heading} className="font-display text-title">
            Excluir Sessão?
          </h2>
          <p id={description} className="text-ink-2">
            A Sessão sai da lista, da Satisfação e do Histórico de apostas. O
            link deixa de aceitar respostas e as perguntas par a par pendentes
            são descartadas. O que já foi enviado ao Trakt fica lá.
          </p>
          {hasFacts && <FactsChoice />}
          <p className="text-meta text-ink-2">
            A exclusão não pode ser desfeita pelo app.
          </p>
          <PostFailed failed={failed} />
          <DeleteActions
            busy={busy !== null}
            onCancel={() => dialog.current?.close()}
          />
        </form>
      </dialog>
    </>
  )
}

/** What happens to the Fatos the Sessão recorded, asked only when it has
 * some. */
function FactsChoice() {
  return (
    <fieldset className="flex flex-col gap-sm">
      <legend className="mb-xs font-semibold">
        O que fazer com os Fatos da Sessão?
      </legend>
      <label className="flex items-start gap-sm">
        <input type="radio" name="modo" value="keep_taste" required />
        <span>
          Manter o gosto. As Notas, os Já vistos e os Declarados continuam
          valendo.
        </span>
      </label>
      <label className="flex items-start gap-sm">
        <input type="radio" name="modo" value="erase" required />
        <span>Apagar tudo. Os Fatos da Sessão são removidos.</span>
      </label>
    </fieldset>
  )
}

/** Cancel, which only closes the dialog, and the delete itself; both off
 * while the post runs. */
function DeleteActions({
  busy,
  onCancel,
}: {
  busy: boolean
  onCancel: () => void
}) {
  return (
    <div className="flex flex-wrap justify-end gap-sm">
      <button
        type="button"
        className={buttonVariants({ variant: 'option' })}
        onClick={onCancel}
        disabled={busy}
      >
        Cancelar
      </button>
      <button
        type="submit"
        className={buttonVariants({ variant: 'commit' })}
        disabled={busy}
      >
        Excluir Sessão
      </button>
    </div>
  )
}
