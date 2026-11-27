import { useId, type ReactNode, type Ref } from 'react'
import type { PersonImports } from '@filmes/engine'
import {
  refusedForm,
  type ImportForm as FormName,
  type ImportNotice,
  type ImportRefusal,
} from '#/content/import-action'
import { personPath, QUEUE_PATH } from '#/content/paths'
import { FIELD } from './kit/field'
import { FieldLabel } from './kit/field-label'
import { FilePicker } from './kit/file-picker'
import { Icon } from './kit/icon'
import { PostAnswers, PostForm } from './kit/post-form'
import { usePostedFeedback } from './kit/posted-feedback'
import { ImportsFrame } from './imports'
import { PERSON_IMPORTS, rssUser, type Resolved } from './imports.copy'
import { Slip } from './kit/slip'
import { PageHead } from './kit/page-head'
import { RowArrow } from './kit/row-arrow'
import {
  Alert,
  Item,
  Items,
  Meta,
  Notice,
  Section,
  Submit,
} from './person-parts'
import { buttonVariants } from './kit/button-variants'
import { Button } from './shadcn/button'
import { TraktSync, type TraktLinkView } from './trakt-sync'

const COPY = PERSON_IMPORTS

/** A Pessoa's imports, whether she is the Dono looking at them and, on
 * the app, what the page knows of her Trakt (#269). */
export type PersonImportsView = PersonImports & {
  own: boolean
  traktLink?: Omit<TraktLinkView, 'user'>
}

/** The public username her last Trakt read used, `@nome`, if any. */
const traktUser = (page: PersonImports) =>
  page.imports
    .filter((record) => record.kind === 'trakt-api')
    .map((record) => record.original)
    .findLast((original) => original.startsWith('@')) ?? null

/** What the last action did: the notice and its counts. */
export type ImportDoneView = {
  notice: ImportNotice
  /** Fatos in (or out, for a removal). */
  facts: number
  /** Of them, the new Notas and Já vistos. */
  ratings: number
  seen: number
  outside?: number
}

/** A Pessoa's imports (`importsPath`). Once something came in, what came
 * in goes first (#274): the counts in her words, the films that wait for
 * her in the queue with "Resolver agora", the files, and the forms folded
 * under "Importar de novo". Before that, the forms are the page: the
 * guided Letterboxd flow (#270: the data page, the ZIP once, the profile
 * after) and the other sites' upload (Trakt, IMDb, Simkl and the TV Time
 * backup, told apart by what the file holds). A refusal shows under the
 * form that was sent (`refusedIn`), with its field marked. Every form is
 * a plain POST (the upload multipart) that comes back here; with the
 * JavaScript, by `fetch`, without a reload (#240). `page` is `'unknown'`
 * when no Pessoa has the slug, null when the engine cannot run on this
 * server. */
export function PersonImportsScreen({
  slug,
  page,
  done,
  refusal,
  refusedIn,
}: {
  slug: string
  page: PersonImportsView | 'unknown' | null
  done?: ImportDoneView
  refusal?: ImportRefusal
  refusedIn?: FormName
}) {
  const own = typeof page === 'object' && page?.own === true
  const name = typeof page === 'object' && page !== null ? page.name : slug
  const { feedback, onAnswer } = usePostedFeedback()
  return (
    <PostAnswers onAnswer={onAnswer}>
      <ImportsFrame back={COPY.back(name, own)} backTo={personPath(slug, own)}>
        {page === null || page === 'unknown' ? (
          <Alert>{page === null ? COPY.unavailable : COPY.unknown}</Alert>
        ) : (
          <ImportsPage
            slug={slug}
            page={page}
            done={done}
            refusal={refusal}
            refusedIn={refusedIn}
            feedback={feedback}
          />
        )}
      </ImportsFrame>
    </PostAnswers>
  )
}

/** The page of a Pessoa there is: the head, the feedback of the last post
 * and, once something came in, the results before the forms. */
function ImportsPage({
  slug,
  page,
  done,
  refusal,
  refusedIn,
  feedback,
}: {
  slug: string
  page: PersonImportsView
  done?: ImportDoneView
  refusal?: ImportRefusal
  refusedIn?: FormName
  feedback: Ref<HTMLDivElement>
}) {
  const inForm = refusal ? refusedForm(refusal, refusedIn) : undefined
  /** The refusal of `form`, when it is the one refused. */
  const refusedOf = (form: FormName) => (inForm === form ? refusal : undefined)
  const forms = (
    <Forms
      slug={slug}
      page={page}
      refusedOf={refusedOf}
      feedback={inForm ? feedback : undefined}
    />
  )
  return (
    <>
      <PageHead
        title={COPY.title(page.name, page.own)}
        lead={COPY.lead(page.name, page.own)}
      />
      <PageFeedback
        refusal={inForm ? undefined : refusal}
        done={done}
        feedback={feedback}
      />
      {page.imports.length > 0 ? (
        <>
          <Results page={page} />
          <Files slug={slug} page={page} />
          <Again open={Boolean(inForm)}>{forms}</Again>
        </>
      ) : (
        forms
      )}
    </>
  )
}

/** The refusal no form owns and the notice of what the last post did. */
function PageFeedback({
  refusal,
  done,
  feedback,
}: {
  refusal?: ImportRefusal
  done?: ImportDoneView
  feedback: Ref<HTMLDivElement>
}) {
  if (!refusal && !done) return null
  return (
    <div ref={feedback}>
      {refusal && <Alert>{COPY.refusals[refusal]}</Alert>}
      {done && <Notice>{COPY.notices[done.notice](done)}</Notice>}
    </div>
  )
}

/** "Importar de novo": the forms, folded under the results. */
function Again({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <details className="group" open={open}>
      <summary
        className={buttonVariants({
          variant: 'option',
          className:
            'list-none group-open:mb-xl [&::-webkit-details-marker]:hidden',
        })}
      >
        {COPY.results.again}
      </summary>
      {children}
    </details>
  )
}

type Refused = (form: FormName) => ImportRefusal | undefined

/** The two ways in: Letterboxd, guided, and the other sites. */
function Forms({
  slug,
  page,
  refusedOf,
  feedback,
}: {
  slug: string
  page: PersonImportsView
  refusedOf: Refused
  feedback?: Ref<HTMLDivElement>
}) {
  const traktRefused = refusedOf('trakt')
  return (
    <div ref={feedback} className="flex flex-col gap-3xl">
      <LetterboxdGuide slug={slug} page={page} refusedOf={refusedOf} />
      {page.traktLink && (
        <TraktSync
          slug={slug}
          name={page.name}
          own={page.own}
          link={{ ...page.traktLink, user: traktUser(page) }}
          refusal={traktRefused && COPY.refusals[traktRefused]}
        />
      )}
      <OtherSites slug={slug} refused={refusedOf('outro')} />
    </div>
  )
}

const actionOf = (slug: string, form?: FormName) =>
  `/importar/${encodeURIComponent(slug)}/acao${form ? `?de=${form}` : ''}`

/** A form of this page: a POST, multipart when it sends a file, by `fetch`
 * once the JavaScript is in (#240). `form` names it in the action, so a
 * refusal comes back to it. `children` see whether its post is running. */
function ImportForm({
  slug,
  action,
  form,
  label,
  upload = false,
  children,
}: {
  slug: string
  action: string
  form?: FormName
  label?: string
  upload?: boolean
  children: (busy: boolean) => ReactNode
}) {
  return (
    <PostForm
      action={actionOf(slug, form)}
      upload={upload}
      label={label}
      className="flex flex-col gap-xl"
    >
      {(busy) => (
        <>
          <input type="hidden" name="acao" value={action} />
          {children(busy)}
        </>
      )}
    </PostForm>
  )
}

type Part = { slug: string; page: PersonImports }

/** "Tirar" opens, under the file, what goes with it and the confirm. */
function RemoveImport({
  slug,
  file,
  original,
}: {
  slug: string
  file: string
  original: string
}) {
  const { files } = COPY
  return (
    <details className="group shrink-0">
      <summary
        aria-label={files.removeLabel(original)}
        className={buttonVariants({
          variant: 'option',
          className:
            'list-none group-open:border-2 group-open:border-ink group-open:bg-surface-2 [&::-webkit-details-marker]:hidden',
        })}
      >
        {files.remove}
      </summary>
      <div className="mt-sm flex max-w-[300px] flex-col gap-sm rounded-field bg-surface-2 p-lg">
        <p className="text-meta">{files.removeWarning}</p>
        <ImportForm slug={slug} action="remover">
          {(busy) => (
            <>
              <input type="hidden" name="arquivo" value={file} />
              <Button
                type="submit"
                variant="option"
                disabled={busy}
                className="self-start"
              >
                {busy ? files.removeBusy : files.removeConfirm}
              </Button>
            </>
          )}
        </ImportForm>
      </div>
    </details>
  )
}

function Files({ slug, page }: Part) {
  const { files } = COPY
  return (
    <Slip
      id="arquivos"
      title={files.title}
      aside={String(page.imports.length)}
      lead={files.lead}
    >
      <Items empty="">
        {page.imports.map((record) => (
          <Item
            key={record.file}
            actions={
              <RemoveImport
                slug={slug}
                file={record.file}
                original={record.original}
              />
            }
          >
            <span className="font-display text-row-title break-all">
              {record.kind === 'letterboxd-rss'
                ? (rssUser(record.original) ?? record.original)
                : record.original}
            </span>
            <Meta parts={[files.kind(record.kind), files.on(record.date)]} />
          </Item>
        ))}
      </Items>
    </Slip>
  )
}

const total = (counts: Readonly<Record<string, number>>) =>
  Object.values(counts).reduce((a, b) => a + b, 0)

/** A count of the Letterboxd line: the number big, what it counts under. */
function Tally({ value, term }: { value: number; term: string }) {
  return (
    <div className="flex flex-col">
      <dt className="order-2 text-meta text-ink-2">{term}</dt>
      <dd className="order-1 font-display text-title tabular-nums">{value}</dd>
    </div>
  )
}

/** The films of her export that wait in the queue, on the card stock,
 * with the way to them: the next step, so it comes first. */
function Waiting({
  report,
  from,
}: {
  report: PersonImports['letterboxd']
  from: Resolved
}) {
  const { results } = COPY
  return (
    <div className="flex flex-col gap-md rounded-field bg-card-stock p-lg text-card-stock-ink">
      <div className="flex flex-col gap-2xs">
        <p className="font-semibold">{results.queued(report.queued, from)}</p>
        <p className="text-meta">{results.queuedLead}</p>
      </div>
      <ul className="flex flex-col gap-2xs text-meta">
        {report.queue.map((item) => (
          <li key={item.id}>
            {item.year === null ? item.name : `${item.name} (${item.year})`}
          </li>
        ))}
      </ul>
      <a
        href={QUEUE_PATH}
        className={buttonVariants({
          variant: 'option',
          className: 'self-start border-transparent',
        })}
      >
        {results.toQueue}
        <RowArrow />
      </a>
    </div>
  )
}

/** Whose films the resolution holds: the TV Time backup's go through the
 * same one as Letterboxd's (#300). */
function resolvedFrom(page: PersonImports): Resolved {
  const kinds = new Set(page.imports.map(({ kind }) => kind))
  if (!kinds.has('tvtime')) return 'letterboxd'
  return kinds.has('letterboxd') || kinds.has('letterboxd-rss')
    ? 'both'
    : 'tvtime'
}

/** Her Letterboxd (and TV Time) films: found, left out (which, and why)
 * and waiting. */
function LetterboxdResult({
  report,
  from,
}: {
  report: PersonImports['letterboxd']
  from: Resolved
}) {
  const { results } = COPY
  const outside = report.discardedItems
  return (
    <div className="flex flex-col gap-lg">
      <h3 className="font-display text-step-title-small">
        {results.letterboxd(report.films, from)}
      </h3>
      <dl className="grid grid-cols-3 gap-lg">
        <Tally value={total(report.resolved)} term={results.found} />
        <Tally value={total(report.discarded)} term={results.outside} />
        <Tally value={report.queued} term={results.waiting} />
      </dl>
      {report.queued > 0 && <Waiting report={report} from={from} />}
      {outside.length > 0 && (
        <details className="group">
          <summary className="inline-flex min-h-touch cursor-pointer list-none items-center text-link text-ink-2 underline underline-offset-3 [&::-webkit-details-marker]:hidden">
            {results.seeOutside(outside.length)}
          </summary>
          <ul className="flex flex-col gap-2xs text-meta">
            {outside.map((item) => (
              <li key={item.id}>
                <span className="font-semibold">
                  {item.year === null
                    ? item.name
                    : `${item.name} (${item.year})`}
                </span>
                {item.reason && (
                  <span className="text-ink-2"> · {item.reason}</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

/** What the imports gave, first on the page once there is any: Letterboxd
 * with its queue, then one line per other site that gave something. */
function Results({ page }: { page: PersonImports }) {
  const { results } = COPY
  const lines = [
    (page.trakt.ratings > 0 || page.trakt.seen > 0) &&
      results.trakt(page.trakt.ratings, page.trakt.seen),
    page.imdb.ratings > 0 && results.imdb(page.imdb.ratings),
    (page.simkl.ratings > 0 || page.simkl.seen > 0) &&
      results.simkl(page.simkl.ratings, page.simkl.seen),
    (page.tvtime.ratings > 0 || page.tvtime.seen > 0) &&
      results.tvtime(page.tvtime.ratings, page.tvtime.seen),
  ].filter((line) => line !== false)
  const letterboxd = page.letterboxd.films > 0 || page.letterboxd.queued > 0
  if (!letterboxd && lines.length === 0) return null
  return (
    <Slip id="resultado" title={results.title}>
      {letterboxd && (
        <LetterboxdResult report={page.letterboxd} from={resolvedFrom(page)} />
      )}
      {lines.length > 0 && (
        <ul
          className={`flex flex-col gap-xs ${letterboxd ? 'border-t border-dashed border-rule pt-lg' : ''}`}
        >
          {lines.map((line) => (
            <li key={line} className="font-display text-step-title-small">
              {line}
            </li>
          ))}
        </ul>
      )}
    </Slip>
  )
}

/** A step of the guided flow: its number in a ring, as the home's guide
 * marks a step to do, its title and what it holds. */
function Step({
  n,
  title,
  children,
}: {
  n: number
  title: string
  children: ReactNode
}) {
  return (
    <li className="flex gap-md py-lg first:pt-0 last:pb-0 [&+li]:border-t [&+li]:border-dashed [&+li]:border-rule">
      <span
        aria-hidden="true"
        className="grid size-7 shrink-0 place-items-center rounded-round border-(length:--border-width-stroke) border-ink font-display text-price-compact text-ink"
      >
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-sm">
        <h3 className="flex min-h-7 items-center font-display text-step-title-small">
          {title}
        </h3>
        {children}
      </div>
    </li>
  )
}

/** The guided Letterboxd flow (#270): Letterboxd lets no other site into
 * the account, so the page walks her through its data page, takes the ZIP
 * for the whole history, and keeps it current from the public profile.
 * Its upload is the screen's one orange button. */
function LetterboxdGuide({
  slug,
  page,
  refusedOf,
}: {
  slug: string
  page: PersonImportsView
  refusedOf: Refused
}) {
  const { letterboxd: guide } = COPY
  return (
    <Section id="letterboxd" title={guide.title} lead={guide.lead}>
      <ol className="flex flex-col">
        <Step n={1} title={guide.open.title}>
          <p className="text-evidence text-ink-2">{guide.open.text}</p>
          <a
            href={guide.open.href}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({
              variant: 'option',
              className: 'self-start',
            })}
          >
            {guide.open.link}
            <RowArrow />
          </a>
        </Step>
        <Step n={2} title={guide.export.title}>
          <p className="text-evidence text-ink-2">{guide.export.text}</p>
        </Step>
        <Step n={3} title={guide.send.title}>
          <LetterboxdUpload slug={slug} refused={refusedOf('letterboxd')} />
        </Step>
        <Step n={4} title={guide.profile.title}>
          <p className="text-evidence text-ink-2">{guide.profile.text}</p>
          <Rss slug={slug} page={page} refused={refusedOf('perfil')} />
        </Step>
      </ol>
    </Section>
  )
}

/** The ZIP of her Letterboxd export, the guide's one orange button. */
function LetterboxdUpload({
  slug,
  refused,
}: {
  slug: string
  refused?: ImportRefusal
}) {
  const { letterboxd: guide, picker } = COPY
  return (
    <ImportForm
      slug={slug}
      action="arquivo"
      form="letterboxd"
      label={guide.send.title}
      upload
    >
      {(busy) => (
        <>
          <FilePicker
            name="arquivo"
            label={guide.send.file}
            accept=".zip,application/zip"
            extensions={['.zip']}
            wrongType={guide.send.wrongType}
            copy={picker}
            error={refused && COPY.refusals[refused]}
          />
          <Submit variant="primary" disabled={busy}>
            {busy ? guide.send.busy : guide.send.submit}
          </Submit>
        </>
      )}
    </ImportForm>
  )
}

/** The Trakt, IMDb and Simkl files and the TV Time backup: how to get each
 * one, folded, and one upload; the server tells the site by what the file
 * holds. */
function OtherSites({
  slug,
  refused,
}: {
  slug: string
  refused?: ImportRefusal
}) {
  const { other, picker } = COPY
  return (
    <Section id="outros" title={other.title} lead={other.lead}>
      <ServiceGuides />
      <ImportForm
        slug={slug}
        action="arquivo"
        form="outro"
        label={other.title}
        upload
      >
        {(busy) => (
          <>
            <FilePicker
              name="arquivo"
              label={other.file}
              accept=".zip,application/zip,.csv,text/csv,.json,application/json"
              extensions={['.zip', '.csv', '.json']}
              wrongType={other.wrongType}
              copy={picker}
              error={refused && COPY.refusals[refused]}
            />
            <Submit disabled={busy}>{busy ? other.busy : other.submit}</Submit>
          </>
        )}
      </ImportForm>
    </Section>
  )
}

/** How to get each site's file, one folded list per site; its first step
 * links to the site's data page (TV Time, closed, has none). */
function ServiceGuides() {
  const { other } = COPY
  return (
    <ul className="flex flex-col">
      {other.services.map(({ service, href, steps }) => (
        <li
          key={service}
          className="border-rule not-first:border-t not-first:border-dashed"
        >
          <details className="group">
            <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-md font-display text-row-title [&::-webkit-details-marker]:hidden">
              {other.how(service)}
              <span
                aria-hidden="true"
                className="text-ink-2 transition-transform group-open:rotate-90"
              >
                <RowArrow />
              </span>
            </summary>
            <ol className="flex list-decimal flex-col gap-2xs pb-md pl-3xl text-evidence">
              {steps.map((step, index) => (
                <li key={step}>
                  {index === 0 && href !== null ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-3"
                    >
                      {step}
                    </a>
                  ) : (
                    step
                  )}
                </li>
              ))}
            </ol>
          </details>
        </li>
      ))}
    </ul>
  )
}

/** The latest Letterboxd profile she read, `@nome`, if any. */
const lastProfile = (page: PersonImports) =>
  page.imports
    .filter((record) => record.kind === 'letterboxd-rss')
    .map((record) => rssUser(record.original))
    .findLast((user) => user !== null) ?? null

/** The Letterboxd profile's public diary, the way to keep the ZIP's
 * history current. Once a profile was read, one tap reads it again; the
 * field for another one folds under it. The server reads the user out of
 * a name, an @name or the profile's address. Another Pessoa's diary needs
 * her yes; on the Dono's own page there is nothing to ask. */
function Rss({
  slug,
  page,
  refused,
}: {
  slug: string
  page: PersonImportsView
  refused?: ImportRefusal
}) {
  const { rss } = COPY
  const last = lastProfile(page)
  const consent = !page.own && <Consent name={page.name} />
  const field = (
    <ImportForm slug={slug} action="rss" form="perfil" label={rss.title}>
      {(busy) => (
        <>
          <UserField refused={refused} />
          {consent}
          <Submit disabled={busy}>{busy ? rss.busy : rss.submit}</Submit>
        </>
      )}
    </ImportForm>
  )
  if (last === null) return field
  return (
    <div className="flex flex-col gap-md">
      <ImportForm
        slug={slug}
        action="rss"
        form="perfil"
        label={rss.update(last)}
      >
        {(busy) => (
          <>
            <input type="hidden" name="usuario" value={last} />
            {consent}
            <Submit disabled={busy}>
              {busy ? rss.busy : rss.update(last)}
            </Submit>
          </>
        )}
      </ImportForm>
      <details className="group" open={refused !== undefined}>
        <summary className="inline-flex min-h-touch cursor-pointer list-none items-center text-link text-ink-2 underline underline-offset-3 group-open:hidden [&::-webkit-details-marker]:hidden">
          {rss.other}
        </summary>
        {field}
      </details>
    </div>
  )
}

/** Another Pessoa's yes to reading her diary. */
function Consent({ name }: { name: string }) {
  return (
    <label className="flex min-h-touch cursor-pointer items-start gap-md rounded-field bg-surface-2 p-lg">
      <input
        type="checkbox"
        name="consentimento"
        value="sim"
        required
        className="mt-0.5 size-5 shrink-0 accent-ink"
      />
      <span>{COPY.rss.consent(name)}</span>
    </label>
  )
}

/** The profile's name, marked with the server's refusal of the last post
 * when it was the profile's. */
function UserField({ refused }: { refused?: ImportRefusal }) {
  const { rss } = COPY
  const id = useId()
  return (
    <div className="flex flex-col gap-xs">
      <FieldLabel label={rss.user} hint={rss.userHint}>
        <input
          type="text"
          name="usuario"
          required
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={refused ? true : undefined}
          aria-describedby={refused ? id : undefined}
          className={FIELD}
        />
      </FieldLabel>
      {refused && (
        <p
          id={id}
          role="alert"
          className="flex items-start gap-2xs text-meta text-ink"
        >
          <Icon name="alert" className="mt-px size-4 shrink-0" />
          {COPY.refusals[refused]}
        </p>
      )}
    </div>
  )
}
