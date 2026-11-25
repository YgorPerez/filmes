import { FIELD } from './kit/field'
import type { ReactNode } from 'react'
import type { PersonImports } from '@filmes/engine'
import {
  LETTERBOXD_USER,
  type ImportNotice,
  type ImportRefusal,
} from '#/content/import-action'
import { ImportsFrame } from './imports'
import { PERSON_IMPORTS } from './imports.copy'
import {
  Alert,
  Disclosure,
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
          <h1 className="font-display text-title">{COPY.title(page.name)}</h1>
          {refusal && <Alert>{COPY.refusals[refusal]}</Alert>}
          {done && (
            <Notice>
              {COPY.notices[done.notice](done.facts, done.outside)}
            </Notice>
          )}
          <Files slug={slug} page={page} />
          <Letterboxd page={page} />
          <Trakt page={page} />
          <Upload slug={slug} />
          <Rss slug={slug} name={page.name} />
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

function Files({ slug, page }: Part) {
  const { files } = COPY
  return (
    <Section id="arquivos" title={files.title} lead={files.lead}>
      <Items empty={files.empty}>
        {page.imports.map((record) => (
          <Item
            key={record.file}
            actions={
              <details className="shrink-0">
                <summary
                  aria-label={files.removeLabel(record.original)}
                  className={buttonVariants({
                    variant: 'option',
                    className: 'list-none [&::-webkit-details-marker]:hidden',
                  })}
                >
                  {files.remove}
                </summary>
                <div className="mt-sm flex max-w-[280px] flex-col gap-sm">
                  <p className="text-meta text-ink-2">{files.removeWarning}</p>
                  <ImportForm slug={slug} action="remover">
                    <input type="hidden" name="arquivo" value={record.file} />
                    <Button
                      type="submit"
                      variant="option"
                      className="self-start"
                    >
                      {files.removeConfirm}
                    </Button>
                  </ImportForm>
                </div>
              </details>
            }
          >
            <span className="font-semibold break-all">{record.original}</span>
            <Meta parts={[files.kind(record.kind), files.on(record.date)]} />
          </Item>
        ))}
      </Items>
    </Section>
  )
}

function Letterboxd({ page }: { page: PersonImports }) {
  const { letterboxd: copy } = COPY
  const report = page.letterboxd
  const paths = (counts: typeof report.resolved) =>
    (Object.keys(copy.paths) as (keyof typeof copy.paths)[])
      .filter((path) => counts[path] > 0)
      .map((path) => `${counts[path]} ${copy.paths[path]}`)
  const resolved = paths(report.resolved)
  const discarded = paths(report.discarded)
  return (
    <Section id="letterboxd" title={copy.title} lead={copy.films(report.films)}>
      {report.films > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-xl gap-y-xs">
          <dt className="font-semibold">{copy.resolved}</dt>
          <dd className="text-ink-2">{resolved.join(' · ') || '0'}</dd>
          <dt className="font-semibold">{copy.discarded}</dt>
          <dd className="text-ink-2">{discarded.join(' · ') || '0'}</dd>
        </dl>
      )}
      {report.queued > 0 && (
        <div className="flex flex-col gap-sm">
          <p>{copy.queued(report.queued)}</p>
          <ul className="flex flex-col gap-0.5 text-meta text-ink-2">
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
              className: 'self-start',
            })}
          >
            {copy.toQueue}
          </a>
        </div>
      )}
    </Section>
  )
}

function Trakt({ page }: { page: PersonImports }) {
  const { trakt } = COPY
  return (
    <Section id="trakt" title={trakt.title}>
      <p className="text-ink-2">
        {trakt.summary(page.trakt.ratings, page.trakt.seen)}
      </p>
    </Section>
  )
}

const control = `${FIELD} w-full file:mr-sm file:rounded-pill file:border file:border-rule file:bg-surface-2 file:px-3 file:py-1 file:text-ink`

function FileField() {
  return (
    <label className="flex flex-col gap-xs">
      <span className="text-[14px] font-semibold">{COPY.upload.file}</span>
      <input
        type="file"
        name="arquivo"
        required
        accept=".zip,application/zip"
        className={control}
      />
    </label>
  )
}

function Upload({ slug }: { slug: string }) {
  const { upload } = COPY
  return (
    <Section id="trazer" title={upload.title}>
      <Disclosure summary={upload.letterboxd}>
        <ImportForm
          slug={slug}
          action="letterboxd"
          label={upload.letterboxd}
          upload
        >
          <p className="text-meta text-ink-2">{upload.letterboxdHow}</p>
          <FileField />
          <Submit>{upload.submit}</Submit>
        </ImportForm>
      </Disclosure>
      <Disclosure summary={upload.trakt}>
        <ImportForm slug={slug} action="trakt" label={upload.trakt} upload>
          <p className="text-meta text-ink-2">{upload.traktHow}</p>
          <FileField />
          <Submit>{upload.submit}</Submit>
        </ImportForm>
      </Disclosure>
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
        <label className="flex min-h-touch items-start gap-sm">
          <input
            type="checkbox"
            name="consentimento"
            value="sim"
            required
            className="mt-1 size-5 shrink-0 accent-ink"
          />
          <span>{rss.consent(name)}</span>
        </label>
        <Submit>{rss.submit}</Submit>
      </ImportForm>
    </Section>
  )
}
