import { useState } from 'react'
import { buttonVariants } from './kit/button-variants'
import { FIELD } from './kit/field'
import { Icon } from './kit/icon'
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
    <div className="flex flex-col gap-sm">
      <div className="flex flex-wrap gap-sm">
        <a href={url} className={buttonVariants({ variant: 'option' })}>
          {PARTICIPATION.share}
        </a>
        <button
          type="button"
          onClick={copy}
          className={buttonVariants({ variant: 'option' })}
        >
          <Icon name="copy" className="size-4" />
          {PARTICIPATION.copy}
        </button>
      </div>
      <p role="status" className="text-meta empty:hidden">
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
