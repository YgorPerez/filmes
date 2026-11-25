import type { ComponentProps, ReactNode } from 'react'
import { PERSON } from './person.copy'
import { Button, buttonVariants } from './shadcn/button'

// The pieces the Pessoas screens share, and the other Dono screens with
// them: the alert and the notice, the Dono tag, a section's card, the
// fields, the forms that post an action and their submit button.

export function Alert({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="flex gap-sm rounded-field border border-marquee-red-text px-3 py-2.5 text-marquee-red-text"
    >
      <span aria-hidden="true">⚠</span>
      <span>{children}</span>
    </p>
  )
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-field border border-rule bg-surface-2 px-3 py-2.5"
    >
      {children}
    </p>
  )
}

/** A form's submit button with every Button prop (`disabled`...);
 * `Submit` is the plain one. */
export const SubmitButton = (
  props: Omit<ComponentProps<typeof Button>, 'type'>,
) => <Button type="submit" {...props} />

export function OwnerTag() {
  return (
    <span className="rounded-pill border border-rule px-2 py-0.5 text-label text-ink-2 uppercase">
      {PERSON.owner}
    </span>
  )
}

/** A section of the Pessoa's page: a card with its title. */
export function Section({
  id,
  title,
  lead,
  children,
}: {
  id: string
  title: string
  lead?: string
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-md rounded-card border border-rule bg-surface p-md"
    >
      <div className="flex flex-col gap-xs">
        <h2 id={id} className="text-title">
          {title}
        </h2>
        {lead && <p className="text-meta text-ink-2">{lead}</p>}
      </div>
      {children}
    </section>
  )
}

/** The items of a section, one per row, or what to say when there are
 * none. */
export function Items({
  empty,
  children,
}: {
  empty: string
  children: ReactNode[]
}) {
  return children.length === 0 ? (
    <p className="text-ink-2">{empty}</p>
  ) : (
    <ul className="flex flex-col">{children}</ul>
  )
}

export function Item({
  children,
  actions,
}: {
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-sm border-rule py-sm not-first:border-t">
      <div className="flex min-w-0 flex-1 basis-[240px] flex-col gap-0.5">
        {children}
      </div>
      {actions}
    </li>
  )
}

/** The line under an item: its parts joined by a middle dot. */
export function Meta({ parts }: { parts: readonly (string | null)[] }) {
  return (
    <span className="text-meta text-ink-2">
      {parts.filter((part) => part !== null && part !== '').join(' · ')}
    </span>
  )
}

/** A form that posts one action to the Pessoa's route
 * (`platform/people.ts`). A plain POST: it works before the JavaScript. */
export function ActionForm({
  slug,
  action,
  label,
  className,
  children,
}: {
  slug: string
  action: string
  label?: string
  className?: string
  children: ReactNode
}) {
  return (
    <form
      method="post"
      action={`/pessoas/${encodeURIComponent(slug)}/acao`}
      aria-label={label}
      className={className ?? 'flex flex-col gap-md'}
    >
      <input type="hidden" name="acao" value={action} />
      {children}
    </form>
  )
}

/** "Tirar": takes one item out of her file. */
export function RemoveForm({
  slug,
  what,
  id,
  label,
}: {
  slug: string
  what: 'stated' | 'report' | 'veto' | 'seen'
  id: string
  label: string
}) {
  return (
    <ActionForm slug={slug} action="remover" className="shrink-0">
      <input type="hidden" name="tipo" value={what} />
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="quiet"
        aria-label={PERSON.removeLabel(label)}
      >
        {PERSON.remove}
      </Button>
    </ActionForm>
  )
}

/** A form that opens on demand, as a `<details>`: no JavaScript needed. */
export function Disclosure({
  summary,
  children,
}: {
  summary: string
  children: ReactNode
}) {
  return (
    <details className="group rounded-field border border-rule">
      <summary className="flex min-h-touch cursor-pointer items-center px-3 font-semibold select-none">
        {summary}
      </summary>
      <div className="border-t border-rule p-md">{children}</div>
    </details>
  )
}

const control =
  'min-h-touch w-full rounded-field border border-rule bg-surface px-3 py-[9px] text-[15px] text-ink'

function Label({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-xs">
      <span className="text-[14px] font-semibold">
        {label}
        {hint && (
          <>
            {' '}
            <span className="font-normal text-ink-2">{hint}</span>
          </>
        )}
      </span>
      {children}
    </label>
  )
}

export function TextField({
  name,
  label,
  hint,
  required = false,
  placeholder,
  pattern,
  type = 'text',
  min,
  max,
}: {
  name: string
  label: string
  hint?: string
  required?: boolean
  placeholder?: string
  pattern?: string
  type?: 'text' | 'number'
  min?: number
  max?: number
}) {
  return (
    <Label label={label} hint={hint}>
      <input
        type={type}
        min={min}
        max={max}
        name={name}
        required={required}
        placeholder={placeholder}
        pattern={pattern}
        autoComplete="off"
        className={control}
      />
    </Label>
  )
}

export function SelectField({
  name,
  label,
  hint,
  options,
  defaultValue,
}: {
  name: string
  label: string
  hint?: string
  options: readonly { value: string; label: string }[]
  defaultValue?: string
}) {
  return (
    <Label label={label} hint={hint}>
      <select name={name} defaultValue={defaultValue} className={control}>
        {options.map(({ value, label: text }) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </Label>
  )
}

/** The submit of a form, quiet unless `variant` says otherwise. */
export function Submit({
  variant = 'quiet',
  children,
}: {
  variant?: 'primary' | 'quiet'
  children: ReactNode
}) {
  return (
    <Button type="submit" variant={variant} className="self-start">
      {children}
    </Button>
  )
}

/** A link that looks like a button: `primary` for the screen's main
 * action, `quiet` for the others. */
export function LinkButton({
  href,
  variant = 'quiet',
  label,
  children,
}: {
  href: string
  variant?: 'primary' | 'quiet'
  label?: string
  children: ReactNode
}) {
  return (
    <a
      href={href}
      aria-label={label}
      className={buttonVariants({ variant, className: 'self-start' })}
    >
      {children}
    </a>
  )
}
