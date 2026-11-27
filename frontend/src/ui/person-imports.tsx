import { FIELD } from './kit/field'
import { FieldLabel } from './kit/field-label'
import { PostAnswers, PostForm } from './kit/post-form'
import { usePostedFeedback } from './kit/posted-feedback'
import type { ReactNode } from 'react'
import type { PersonImports } from '@filmes/engine'
import type { ImportNotice, ImportRefusal } from '#/content/import-action'
import { personPath, QUEUE_PATH } from '#/content/paths'
import { ImportsFrame } from './imports'
import { PERSON_IMPORTS } from './imports.copy'
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
  TextField,
} from './person-parts'
import { buttonVariants } from './kit/button-variants'
import { Button } from './shadcn/button'

const COPY = PERSON_IMPORTS

/** A Pessoa's imports, and whether she is the Dono looking at them. */
export type PersonImportsView = PersonImports & { own: boolean }

/** What the last action did: the notice and its counts. */
export type ImportDoneView = {
  notice: ImportNotice
  facts: number
  outside?: number
}

/** A Pessoa's imports (`importsPath`): the upload first (one file field: the server tells
 * Letterboxd from Trakt by the ZIP, IMDb by its CSV and Simkl by its JSON), then the Letterboxd profile, what the
 * imports gave (only once they gave something) and the files, each with
 * its Tirar. Every form is a plain POST (the upload multipart) that comes
 * back here; with the JavaScript, by `fetch`, without a reload (#240). `page` is `'unknown'` when no Pessoa has the slug, null when
 * the engine cannot run on this server. */
export function PersonImportsScreen({
  slug,
  page,
  done,
  refusal,
}: {
  slug: string
  page: PersonImportsView | 'unknown' | null
  done?: ImportDoneView
  refusal?: ImportRefusal
}) {
  const own = typeof page === 'object' && page?.own === true
  const name = typeof page === 'object' && page !== null ? page.name : slug
  const { feedback, onAnswer } = usePostedFeedback()
  return (
    <PostAnswers onAnswer={onAnswer}>
      <ImportsFrame back={COPY.back(name, own)} backTo={personPath(slug, own)}>
        {page === null ? (
          <Alert>{COPY.unavailable}</Alert>
        ) : page === 'unknown' ? (
          <Alert>{COPY.unknown}</Alert>
        ) : (
          <>
            <PageHead title={COPY.title(page.name, page.own)} />
            {(refusal || done) && (
              <div ref={feedback}>
                {refusal && <Refusal refusal={refusal} />}
                {done && (
                  <Notice>
                    {COPY.notices[done.notice](done.facts, done.outside)}
                  </Notice>
                )}
              </div>
            )}
            <Upload slug={slug} />
            <Rss slug={slug} name={page.name} own={page.own} />
            <Summaries page={page} />
            <Files slug={slug} page={page} />
          </>
        )}
      </ImportsFrame>
    </PostAnswers>
  )
}

const actionOf = (slug: string) => `/importar/${encodeURIComponent(slug)}/acao`

/** A form of this page: a POST, multipart when it sends a file, by `fetch`
 * once the JavaScript is in (#240). `children` see whether its post is
 * running. */
function ImportForm({
  slug,
  action,
  label,
  upload = false,
  children,
}: {
  slug: string
  action: string
  label?: string
  upload?: boolean
  children: (busy: boolean) => ReactNode
}) {
  return (
    <PostForm
      action={actionOf(slug)}
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
    <Slip id="arquivos" title={files.title}>
      <Items empty={files.empty}>
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
              {record.original}
            </span>
            <Meta parts={[files.kind(record.kind), files.on(record.date)]} />
          </Item>
        ))}
      </Items>
      <p className="text-meta text-ink-2">{files.lead}</p>
    </Slip>
  )
}

/** A line of the Letterboxd slip: what, and how many by which path. */
function Tally({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex flex-col gap-2xs">
      <dt className="font-display text-label text-ink-2 uppercase">{term}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}

/** What waits in the queue from her export, on the card stock. */
function Waiting({ report }: { report: PersonImports['letterboxd'] }) {
  const { letterboxd: copy } = COPY
  return (
    <div className="flex flex-col gap-md rounded-field bg-card-stock p-lg text-card-stock-ink">
      <p className="font-semibold">{copy.queued(report.queued)}</p>
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
        {copy.toQueue}
        <RowArrow />
      </a>
    </div>
  )
}

const hasLetterboxd = (page: PersonImports) =>
  page.letterboxd.films > 0 || page.letterboxd.queued > 0

const hasTrakt = (page: PersonImports) =>
  page.trakt.ratings > 0 || page.trakt.seen > 0

const hasSimkl = (page: PersonImports) =>
  page.simkl.ratings > 0 || page.simkl.seen > 0

/** What the imports gave, by service: a card only once it gave something;
 * Trakt, IMDb and Simkl, which only count, share the narrow column. */
function Summaries({ page }: { page: PersonImports }) {
  const letterboxd = hasLetterboxd(page)
  const trakt = hasTrakt(page)
  const imdb = page.imdb.ratings > 0
  const simkl = hasSimkl(page)
  const counted = trakt || imdb || simkl
  if (!letterboxd && !counted) return null
  return (
    <div
      className={`grid gap-2xl ${letterboxd && counted ? 'sm:grid-cols-[3fr_2fr]' : ''}`}
    >
      {letterboxd && <Letterboxd page={page} />}
      {counted && (
        <div className="grid content-start gap-2xl">
          {trakt && <Trakt page={page} />}
          {imdb && <Imdb page={page} />}
          {simkl && <Simkl page={page} />}
        </div>
      )}
    </div>
  )
}

function Letterboxd({ page }: { page: PersonImports }) {
  const { letterboxd: copy } = COPY
  const report = page.letterboxd
  const paths = (counts: typeof report.resolved) =>
    (Object.keys(copy.paths) as (keyof typeof copy.paths)[])
      .filter((path) => counts[path] > 0)
      .map((path) => `${counts[path]} ${copy.paths[path]}`)
  return (
    <Slip id="letterboxd" title={copy.title} aside={copy.films(report.films)}>
      {report.films > 0 && (
        <dl className="grid gap-lg sm:grid-cols-2">
          <Tally
            term={copy.resolved}
            value={paths(report.resolved).join(' · ') || '0'}
          />
          <Tally
            term={copy.discarded}
            value={paths(report.discarded).join(' · ') || '0'}
          />
        </dl>
      )}
      {report.queued > 0 && <Waiting report={report} />}
    </Slip>
  )
}

function Trakt({ page }: { page: PersonImports }) {
  const { trakt } = COPY
  return (
    <Slip id="trakt" title={trakt.title}>
      <p>{trakt.summary(page.trakt.ratings, page.trakt.seen)}</p>
    </Slip>
  )
}

function Imdb({ page }: { page: PersonImports }) {
  const { imdb } = COPY
  return (
    <Slip id="imdb" title={imdb.title}>
      <p>{imdb.summary(page.imdb.ratings)}</p>
    </Slip>
  )
}

function Simkl({ page }: { page: PersonImports }) {
  const { simkl } = COPY
  return (
    <Slip id="simkl" title={simkl.title}>
      <p>{simkl.summary(page.simkl.ratings, page.simkl.seen)}</p>
    </Slip>
  )
}

const fileControl = `${FIELD} w-full cursor-pointer file:mr-lg file:min-h-9 file:cursor-pointer file:rounded-pill file:border-(length:--border-width-stroke) file:border-rule file:bg-surface-2 file:px-xl file:font-display file:text-control file:text-ink`

/** How to download the file: one line per service, its name a link to its
 * data settings. Spans, so it also fits inside the alert's paragraph. */
function HowTo() {
  return (
    <span className="flex flex-col gap-2xs text-meta text-ink-2">
      {COPY.upload.how.map(({ service, href, steps }) => (
        <span key={service}>
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-ink underline underline-offset-3"
          >
            {service}
          </a>
          : {steps}
        </span>
      ))}
    </span>
  )
}

/** The refusal; a file of no service also says how to get the right
 * one. */
function Refusal({ refusal }: { refusal: ImportRefusal }) {
  return (
    <Alert>
      {COPY.refusals[refusal]}
      {refusal === 'origem' && (
        <span className="mt-xs block">
          <HowTo />
        </span>
      )}
    </Alert>
  )
}

/** The page's main action, always open: one file field for either
 * service, and the only orange button on the screen (The One Orange Button
 * Rule). The import starts on the button, not on picking the file. */
function Upload({ slug }: { slug: string }) {
  const { upload } = COPY
  return (
    <Section id="trazer" title={upload.title}>
      <ImportForm slug={slug} action="arquivo" label={upload.title} upload>
        {(busy) => (
          <>
            <div className="flex flex-col gap-sm">
              <FieldLabel label={upload.file}>
                <input
                  type="file"
                  name="arquivo"
                  required
                  accept=".zip,application/zip,.csv,text/csv,.json,application/json"
                  className={fileControl}
                />
              </FieldLabel>
              <HowTo />
            </div>
            <Submit variant="primary" disabled={busy}>
              {busy ? upload.busy : upload.submit}
            </Submit>
          </>
        )}
      </ImportForm>
    </Section>
  )
}

/** The Letterboxd profile's public diary, secondary to the ZIP. The
 * server reads the user out of a name, an @name or the profile's address.
 * Another Pessoa's diary needs her yes; on the Dono's own page there is
 * nothing to ask. */
function Rss({
  slug,
  name,
  own,
}: {
  slug: string
  name: string
  own: boolean
}) {
  const { rss } = COPY
  return (
    <Section id="rss" title={rss.title} lead={rss.lead}>
      <ImportForm slug={slug} action="rss" label={rss.title}>
        {(busy) => (
          <>
            <TextField
              name="usuario"
              label={rss.user}
              hint={rss.userHint}
              required
            />
            {!own && (
              <label className="flex min-h-touch cursor-pointer items-start gap-md rounded-field bg-surface-2 p-lg">
                <input
                  type="checkbox"
                  name="consentimento"
                  value="sim"
                  required
                  className="mt-0.5 size-5 shrink-0 accent-ink"
                />
                <span>{rss.consent(name)}</span>
              </label>
            )}
            <Submit disabled={busy}>{busy ? rss.busy : rss.submit}</Submit>
          </>
        )}
      </ImportForm>
    </Section>
  )
}
