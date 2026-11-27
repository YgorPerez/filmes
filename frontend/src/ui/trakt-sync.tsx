import type { ReactNode } from 'react'
import { TRAKT_PATH } from '#/content/trakt-form'
import { FIELD } from './kit/field'
import { FieldLabel } from './kit/field-label'
import { buttonVariants } from './kit/button-variants'
import { PostForm } from './kit/post-form'
import { RowArrow } from './kit/row-arrow'
import { Alert, Section, Submit } from './person-parts'
import { TRAKT_SYNC as COPY } from './trakt-sync.copy'

/** What the import page knows of a Pessoa's Trakt (#269). */
export type TraktLinkView = {
  /** The server reads Trakt (it has a client id). */
  available: boolean
  /** She connected her own account at `/trakt`. */
  connected: boolean
  /** The public username her last read used, `@nome`, if any. */
  user: string | null
}

/** The one Trakt slip of a Pessoa's import page (#269, #274), with one
 * way recommended. On her own page: connect her account (`/trakt`), read
 * then at each new Session; once connected or linked to a public profile,
 * "Sincronizar agora". The profile by its name is folded under it, and so
 * is the ZIP (`zip`). On another Pessoa's page, only she can connect hers:
 * her public profile with her yes, and no way to `/trakt`. On a server
 * with no Trakt client id, the ZIP is the way, unfolded. */
export function TraktSync({
  slug,
  name,
  own,
  link,
  refusal,
  zip,
  zipOpen = false,
}: {
  slug: string
  name: string
  own: boolean
  link: TraktLinkView
  /** Why the last read of hers did not go, said here, under its forms. */
  refusal?: string
  /** The ZIP's steps and upload. */
  zip?: ReactNode
  /** The ZIP's fold opens (its upload came back refused). */
  zipOpen?: boolean
}) {
  if (!link.available)
    return (
      <Section id="trakt" title={COPY.title} lead={COPY.zipOnly}>
        {zip}
      </Section>
    )
  // `de=trakt`: a refusal comes back to this section (#270).
  const action = `/importar/${encodeURIComponent(slug)}/acao?de=trakt`
  // Her own account, connected: read by the API, no username to type.
  const mine = own && link.connected
  const linked = mine || link.user !== null
  return (
    <Section
      id="trakt"
      title={COPY.title}
      lead={
        own
          ? mine
            ? COPY.connected
            : linked
              ? COPY.linkedOwn
              : COPY.connect
          : COPY.other(name)
      }
    >
      {refusal && <Alert>{refusal}</Alert>}
      {linked && (
        <SyncForm
          action={action}
          label={mine ? COPY.sync : COPY.syncUser(link.user ?? '')}
        />
      )}
      {own && (
        <a
          href={TRAKT_PATH}
          className={buttonVariants({
            // The Letterboxd upload is the page's one orange button.
            variant: 'option',
            className: 'self-start',
          })}
        >
          {mine ? COPY.manage : COPY.connectLink}
          <RowArrow />
        </a>
      )}
      {!mine &&
        (!own && link.user === null ? (
          <UserForm action={action} name={name} own={own} />
        ) : (
          <Fold summary={link.user === null ? COPY.ownUser : COPY.otherUser}>
            <UserForm action={action} name={name} own={own} />
          </Fold>
        ))}
      {zip && (
        <Fold summary={COPY.zip} open={zipOpen}>
          {zip}
        </Fold>
      )}
    </Section>
  )
}

/** A way that is not the recommended one, folded behind a link. */
function Fold({
  summary,
  open = false,
  children,
}: {
  summary: string
  open?: boolean
  children: ReactNode
}) {
  return (
    <details
      className="group border-t border-dashed border-rule pt-sm"
      open={open}
    >
      <summary className="inline-flex min-h-touch cursor-pointer list-none items-center text-link text-ink-2 underline underline-offset-3 group-open:mb-md group-open:text-ink [&::-webkit-details-marker]:hidden">
        {summary}
      </summary>
      {children}
    </details>
  )
}

/** "Ler agora", where the import page says when her Trakt was read
 * (#274). */
export function TraktReadNow({ slug, label }: { slug: string; label: string }) {
  return (
    <SyncForm
      action={`/importar/${encodeURIComponent(slug)}/acao?de=trakt`}
      label={label}
      name={label}
    />
  )
}

/** "Sincronizar agora": reads her Trakt again, now. */
function SyncForm({
  action,
  label,
  name = COPY.sync,
}: {
  action: string
  label: string
  /** The form's accessible name. */
  name?: string
}) {
  return (
    <PostForm action={action} label={name}>
      {(busy) => (
        <>
          <input type="hidden" name="acao" value="trakt" />
          <Submit disabled={busy}>{busy ? COPY.busy : label}</Submit>
        </>
      )}
    </PostForm>
  )
}

/** A public profile by its username: her yes on another Pessoa's page. */
function UserForm({
  action,
  name,
  own,
}: {
  action: string
  name: string
  own: boolean
}) {
  return (
    <PostForm
      action={action}
      label={COPY.read}
      className="flex flex-col gap-xl"
    >
      {(busy) => (
        <>
          <input type="hidden" name="acao" value="trakt" />
          <FieldLabel label={COPY.user} hint={COPY.userHint}>
            <input
              type="text"
              name="usuario"
              required
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className={FIELD}
            />
          </FieldLabel>
          {!own && (
            <label className="flex min-h-touch cursor-pointer items-start gap-md rounded-field bg-surface-2 p-lg">
              <input
                type="checkbox"
                name="consentimento"
                value="sim"
                required
                className="mt-0.5 size-5 shrink-0 accent-ink"
              />
              <span>{COPY.consent(name)}</span>
            </label>
          )}
          <Submit disabled={busy}>{busy ? COPY.busy : COPY.read}</Submit>
        </>
      )}
    </PostForm>
  )
}
