import { FIELD } from './kit/field'
import { FieldLabel } from './kit/field-label'
import type { ReactNode } from 'react'
import type { PersonImports } from '@filmes/engine'
import {
  LETTERBOXD_USER,
  type ImportNotice,
  type ImportRefusal,
} from '#/content/import-action'
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
import { Button, buttonVariants } from './shadcn/button'

const COPY = PERSON_IMPORTS

/** What the last action did: the notice and its counts. */
export type ImportDoneView = {
  notice: ImportNotice
  facts: number
  outside?: number
}

/** `/importar/<slug>`: the Pessoa's imports, what they gave, and the forms
 * to bring an export, link her RSS or take an import out. Every form is a
 * plain POST (the uploads multipart) that comes back here. `page` is
 * `'unknown'` when no Pessoa has the slug, null when the engine cannot run
 * on this server. */
export function PersonImportsScreen({
  slug,
  page,
  done,
  refusal,
}: {
  slug: string
  page: PersonImports | 'unknown' | null
  done?: ImportDoneView
  refusal?: ImportRefusal
}) {
  return (
    <ImportsFrame back={COPY.back} backTo="/importar">
      {page === null ? (
        <Alert>{COPY.unavailable}</Alert>
      ) : page === 'unknown' ? (
        <Alert>{COPY.unknown}</Alert>
      ) : (
        <>
          <PageHead title={COPY.title(page.name)} />
          {refusal && <Alert>{COPY.refusals[refusal]}</Alert>}
          {done && (
            <Notice>
              {COPY.notices[done.notice](done.facts, done.outside)}
            </Notice>
          )}
          <div className="grid gap-2xl sm:grid-cols-[3fr_2fr]">
            <Letterboxd page={page} />
            <Trakt page={page} />
          </div>
          <Upload slug={slug} />
          <Rss slug={slug} name={page.name} />
          <Files slug={slug} page={page} />
        </>
      )}
    </ImportsFrame>
  )
}

const actionOf = (slug: string) => `/importar/${encodeURIComponent(slug)}/acao`

/** A form of this page: a plain POST, multipart when it sends a file. */
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
  children: ReactNode
}) {
  return (
    <form
      method="post"
      action={actionOf(slug)}
      encType={upload ? 'multipart/form-data' : undefined}
      aria-label={label}
      className="flex flex-col gap-xl"
    >
      <input type="hidden" name="acao" value={action} />
      {children}
    </form>
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
          <input type="hidden" name="arquivo" value={file} />
          <Button type="submit" variant="option" className="self-start">
            {files.removeConfirm}
          </Button>
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
            <span className="font-display text-[15px] font-bold break-all">
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
        href="/fila"
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

const fileControl = `${FIELD} w-full cursor-pointer file:mr-lg file:min-h-9 file:cursor-pointer file:rounded-pill file:border-[1.5px] file:border-rule file:bg-surface-2 file:px-xl file:font-display file:text-control file:text-ink`

function FileField() {
  return (
    <FieldLabel label={COPY.upload.file}>
      <input
        type="file"
        name="arquivo"
        required
        accept=".zip,application/zip"
        className={fileControl}
      />
    </FieldLabel>
  )
}

/** One of the two exports: a row that opens its form. Both rows share a
 * name, so opening one closes the other and the screen shows one orange
 * Importar at a time (The One Orange Button Rule). */
function ExportChoice({
  slug,
  kind,
  summary,
  how,
}: {
  slug: string
  kind: 'letterboxd' | 'trakt'
  summary: string
  how: string
}) {
  return (
    <details
      name="trazer"
      className="group rounded-field border-[1.5px] border-rule open:border-ink"
    >
      <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-sm px-xl font-display text-[15px] font-bold select-none [&::-webkit-details-marker]:hidden">
        {summary}
        <span className="transition-transform group-open:rotate-90 motion-reduce:transition-none">
          <RowArrow />
        </span>
      </summary>
      <div className="border-t border-dashed border-rule p-xl">
        <ImportForm slug={slug} action={kind} label={summary} upload>
          <p className="text-meta text-ink-2">{how}</p>
          <FileField />
          <Submit variant="primary">{COPY.upload.submit}</Submit>
        </ImportForm>
      </div>
    </details>
  )
}

function Upload({ slug }: { slug: string }) {
  const { upload } = COPY
  return (
    <Section id="trazer" title={upload.title}>
      <ExportChoice
        slug={slug}
        kind="letterboxd"
        summary={upload.letterboxd}
        how={upload.letterboxdHow}
      />
      <ExportChoice
        slug={slug}
        kind="trakt"
        summary={upload.trakt}
        how={upload.traktHow}
      />
    </Section>
  )
}

function Rss({ slug, name }: { slug: string; name: string }) {
  const { rss } = COPY
  return (
    <Section id="rss" title={rss.title} lead={rss.lead}>
      <ImportForm slug={slug} action="rss" label={rss.title}>
        <TextField
          name="usuario"
          label={rss.user}
          hint={rss.userHint}
          required
          pattern={LETTERBOXD_USER}
        />
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
        <Submit>{rss.submit}</Submit>
      </ImportForm>
    </Section>
  )
}
