import { useState } from 'react'
import { buttonVariants } from './kit/button-variants'
import { FIELD } from './kit/field'
import { Icon } from './kit/icon'
import { MENU_ROW } from './kit/menu-row'
import { PARTICIPATION } from './session-link.copy'

/** The Link para os Presentes and its copy button: two pills, or, in a
 * menu (`rows`), two of its rows (#272). */
export function ShareSessionLink({
  url,
  rows = false,
}: {
  url: string
  rows?: boolean
}) {
  const [state, setState] = useState<'ready' | 'copied' | 'manual'>('ready')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setState('copied')
    } catch {
      setState('manual')
    }
  }
  return (
    <div className={`flex flex-col ${rows ? 'gap-xs' : 'gap-sm'}`}>
      <div className={rows ? 'flex flex-col' : 'flex flex-wrap gap-sm'}>
        <a
          href={url}
          className={rows ? MENU_ROW : buttonVariants({ variant: 'option' })}
        >
          {rows && <Icon name="people" />}
          {PARTICIPATION.share}
        </a>
        <button
          type="button"
          onClick={copy}
          className={rows ? MENU_ROW : buttonVariants({ variant: 'option' })}
        >
          <Icon name="copy" className={rows ? undefined : 'size-4'} />
          {PARTICIPATION.copy}
        </button>
      </div>
      <p
        role="status"
        className={`text-meta empty:hidden ${rows ? 'px-md' : ''}`}
      >
        {state === 'copied' && PARTICIPATION.copied}
        {state === 'manual' && PARTICIPATION.manual}
      </p>
      {state === 'manual' && (
        <input
          aria-label={PARTICIPATION.share}
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className={FIELD}
        />
      )}
    </div>
  )
}
