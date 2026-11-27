import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from './icon'

// A file field as a full-width drop zone (#274): the native input is
// visually hidden inside a label the size of the zone, so a tap anywhere
// picks the file and the zone says which one was picked, where the
// browser's own control truncated it to "Nenhum a…o escolhido". A file of
// the wrong kind is caught on picking, before the upload: the field is
// marked (`aria-invalid`, the alert under it) and the form will not post
// it. `error` is the server's refusal of the last post, shown in the same
// place.

export function FilePicker({
  name,
  label,
  accept,
  extensions,
  wrongType,
  copy,
  error,
}: {
  name: string
  label: string
  /** The input's `accept`. */
  accept: string
  /** The endings a right file has, lower case: `.zip`. */
  extensions: readonly string[]
  /** What the field says of a file of another kind. */
  wrongType: string
  copy: { pick: string; none: string; change: string }
  /** The server's refusal of this field's last post. */
  error?: string
}) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [chosen, setChosen] = useState<string | null>(null)
  const [wrong, setWrong] = useState(false)
  // The server's refusal stays until she picks another file; a new post
  // may bring it back.
  const [dismissed, setDismissed] = useState<string | undefined>(undefined)
  // The form emptied after a post that went through: so is the zone.
  useEffect(() => {
    const form = input.current?.form
    if (!form) return
    const reset = () => {
      setChosen(null)
      setWrong(false)
    }
    const submit = () => setDismissed(undefined)
    form.addEventListener('reset', reset)
    form.addEventListener('submit', submit)
    return () => {
      form.removeEventListener('reset', reset)
      form.removeEventListener('submit', submit)
    }
  }, [])
  const problem = wrong
    ? wrongType
    : error !== undefined && error !== dismissed
      ? error
      : undefined
  const problemId = `${id}-problema`
  return (
    <div className="flex flex-col gap-xs">
      <span id={`${id}-rotulo`} className="font-display text-field-label">
        {label}
      </span>
      <label
        className={`flex min-h-[64px] cursor-pointer items-center gap-md rounded-field border-dashed bg-surface-2 px-lg py-md focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink hover:border-ink ${
          problem
            ? 'border-2 border-ink'
            : 'border-(length:--border-width-stroke) border-rule-strong'
        }`}
      >
        <Icon name="upload" className="size-6 shrink-0" />
        <span className="flex min-w-0 flex-col">
          <span className="font-display text-row-title break-all">
            {chosen ?? copy.pick}
          </span>
          <span className="text-meta text-ink-2">
            {chosen === null ? copy.none : copy.change}
          </span>
        </span>
        <input
          ref={input}
          type="file"
          name={name}
          required
          accept={accept}
          aria-labelledby={`${id}-rotulo`}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? problemId : undefined}
          className="sr-only"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            const bad =
              file !== undefined &&
              !extensions.some((end) => file.name.toLowerCase().endsWith(end))
            setChosen(file?.name ?? null)
            setWrong(bad)
            setDismissed(error)
            event.currentTarget.setCustomValidity(bad ? wrongType : '')
          }}
        />
      </label>
      {problem && (
        <p
          id={problemId}
          role="alert"
          className="flex items-start gap-2xs text-meta text-ink"
        >
          <Icon name="alert" className="mt-px size-4 shrink-0" />
          {problem}
        </p>
      )}
    </div>
  )
}
