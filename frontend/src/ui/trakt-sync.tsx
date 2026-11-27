import { TRAKT_PATH } from '#/content/trakt-form'
import { FIELD } from './kit/field'
import { FieldLabel } from './kit/field-label'
import { buttonVariants } from './kit/button-variants'
import { PostForm } from './kit/post-form'
import { RowArrow } from './kit/row-arrow'
import { Section, Submit } from './person-parts'
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

/** The Trakt section of a Pessoa's import page (#269). Her connected
 * account, or a public profile by its username, is read by the API; the
 * Session reads it again each time one opens, and "Sincronizar agora"
 * reads it now. On her own page she can connect hers (`/trakt`); another
 * Pessoa's profile needs her yes, as the Letterboxd diary does. Without a
 * client id on the server, nothing shows: the ZIP is the way. */
export function TraktSync({
  slug,
  name,
  own,
  link,
}: {
  slug: string
  name: string
  own: boolean
  link: TraktLinkView
}) {
  if (!link.available) return null
  const action = `/importar/${encodeURIComponent(slug)}/acao`
  const synced = (own && link.connected) || link.user !== null
  return (
    <Section
      id="trakt-api"
      title={COPY.title}
      lead={
        own
          ? link.connected
            ? COPY.connected
            : COPY.connect
          : COPY.other(name)
      }
    >
      {synced && (
        <PostForm action={action} label={COPY.sync}>
          {(busy) => (
            <>
              <input type="hidden" name="acao" value="trakt" />
              <Submit disabled={busy}>
                {busy
                  ? COPY.busy
                  : own && link.connected
                    ? COPY.sync
                    : COPY.syncUser(link.user ?? '')}
              </Submit>
            </>
          )}
        </PostForm>
      )}
      <a
        href={TRAKT_PATH}
        className={buttonVariants({
          variant: 'option',
          className: 'self-start',
        })}
      >
        {own
          ? link.connected
            ? COPY.manage
            : COPY.connectLink
          : COPY.otherLink}
        <RowArrow />
      </a>
      {!(own && link.connected) &&
        (link.user === null ? (
          <UserForm action={action} name={name} own={own} />
        ) : (
          <details className="group">
            <summary className="inline-flex min-h-touch cursor-pointer list-none items-center text-link text-ink-2 underline underline-offset-3 group-open:hidden [&::-webkit-details-marker]:hidden">
              {COPY.otherUser}
            </summary>
            <UserForm action={action} name={name} own={own} />
          </details>
        ))}
    </Section>
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
      className="flex flex-col gap-xl border-t border-dashed border-rule pt-xl"
    >
      {(busy) => (
        <>
          <input type="hidden" name="acao" value="trakt" />
          {own && (
            <p className="font-display text-step-title-small">{COPY.ownUser}</p>
          )}
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
