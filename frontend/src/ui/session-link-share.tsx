import { useState } from 'react'
import { FIELD } from './kit/field'
import { Icon } from './kit/icon'
import { MENU_ROW } from './kit/menu-row'
import { PARTICIPATION } from './session-link.copy'

export function ShareSessionLink({ url }: { url: string }) {
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
    <div className="flex flex-col gap-xs">
      {/* Rows of the Session's ⋯ menu, as the account menu (#346). */}
      <ul className="flex flex-col">
        <li>
          <a href={url} className={MENU_ROW}>
            <Icon name="people" />
            {PARTICIPATION.share}
          </a>
        </li>
        <li>
          <button type="button" onClick={copy} className={MENU_ROW}>
            <Icon name="copy" />
            {PARTICIPATION.copy}
          </button>
        </li>
      </ul>
      <p role="status" className="px-md text-meta empty:hidden">
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
