import { useState } from 'react'
import type { EvaluationReport } from '#/platform/operations'
import {
  parseReport,
  tidyReport,
  weightsToml,
  type ReportBlock,
} from './evaluation-report'
import { buttonVariants } from './kit/button-variants'
import { Icon } from './kit/icon'
import { OPERATIONS } from './operations.copy'
import { Disclosure } from './operations-parts'

const COPY = OPERATIONS.evaluation

/** The section whose YAML is today's weights, shown and copied as the
 * TOML of `config/weights.toml`. */
const WEIGHTS_SECTION = 'Pesos'

/** The section whose YAML holds every measure of the grid's best sets:
 * the page keeps its sentence and leaves the YAML to the file. */
const GRID_SECTION = 'Grade de pesos'

/** A button that puts `text` on the clipboard and says it did; where the
 * browser refuses, it says to select the text by hand. */
export function CopyButton({
  text,
  label,
  name,
}: {
  text: string
  label: string
  /** The accessible name, when the label alone is ambiguous on the page. */
  name?: string
}) {
  const [state, setState] = useState<'ready' | 'copied' | 'manual'>('ready')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch {
      setState('manual')
    }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-sm">
      <button
        type="button"
        onClick={copy}
        aria-label={name}
        className={buttonVariants({
          variant: 'option',
          className: 'whitespace-nowrap',
        })}
      >
        <Icon name="copy" className="size-4" />
        {label}
      </button>
      <span role="status" className="text-meta text-ink-2 empty:hidden">
        {state === 'copied' && OPERATIONS.copied}
        {state === 'manual' && OPERATIONS.copyManual}
      </span>
    </span>
  )
}

/** A block's key: its kind and how it begins (no two blocks of a section
 * begin alike). */
const blockKey = (block: ReportBlock) => {
  switch (block.kind) {
    case 'table':
      return `table:${block.head.join('|')}`
    case 'list':
      return `list:${block.items[0] ?? ''}`
    default:
      return `${block.kind}:${block.text.slice(0, 60)}`
  }
}

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' }

/** A report table: a grid at 640px and up; on the phone, where its columns
 * do not fit, each row stacks as "column: value" lines under its name, so
 * the last column (the calibration's "Sobe?") is never past the edge, and
 * a cell with no Notas leaves the stack. */
const REPORT_TABLE = [
  'w-full text-meta tabular-nums',
  '[&_td]:px-sm [&_td]:py-xs [&_th]:px-sm [&_th]:py-xs',
  'max-sm:block max-sm:[&_tbody]:block max-sm:[&_thead]:sr-only',
  'max-sm:[&_tr]:block max-sm:[&_tr]:py-xs max-sm:[&_th]:block max-sm:[&_th]:px-0',
  'max-sm:[&_td]:flex max-sm:[&_td]:justify-between max-sm:[&_td]:gap-md max-sm:[&_td]:px-0 max-sm:[&_td]:py-2xs max-sm:[&_td]:text-right',
  'max-sm:[&_td]:before:text-left max-sm:[&_td]:before:text-ink-2 max-sm:[&_td]:before:content-[attr(data-label)]',
].join(' ')

function Block({ block, weights }: { block: ReportBlock; weights: boolean }) {
  switch (block.kind) {
    case 'table':
      return (
        <div className="overflow-x-auto">
          <table className={REPORT_TABLE}>
            <thead>
              <tr className="border-b border-rule font-display">
                {block.head.map((cell, i) => (
                  <th
                    key={cell}
                    scope="col"
                    className={`whitespace-nowrap ${ALIGN[block.align[i] ?? 'left']}`}
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row) => (
                <tr key={row.join('|')} className="border-b border-rule">
                  {row.map((cell, i) =>
                    i === 0 ? (
                      <th
                        key={block.head[i] ?? cell}
                        scope="row"
                        className="text-left whitespace-nowrap"
                      >
                        {cell}
                      </th>
                    ) : i === row.length - 1 &&
                      row.length < block.head.length ? (
                      // A row with nothing measured: one line that says why.
                      <td
                        key="empty"
                        colSpan={block.head.length - i}
                        className="text-left text-ink-2"
                      >
                        {cell}
                      </td>
                    ) : (
                      <td
                        key={block.head[i] ?? cell}
                        data-label={block.head[i]}
                        className={`sm:whitespace-nowrap ${ALIGN[block.align[i] ?? 'left']} ${cell === COPY.noRatingsCell ? 'text-ink-2 max-sm:hidden' : ''}`}
                      >
                        {cell}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'code': {
      const toml = weights ? weightsToml(block.text) : null
      return (
        <div className="flex flex-col gap-sm">
          {toml && <CopyButton text={toml} label={COPY.copyToml} />}
          <pre
            className={`max-h-[50vh] overflow-auto rounded-field bg-surface-2 p-md font-mono text-meta ${toml ? '' : 'wrap-anywhere whitespace-pre-wrap'}`}
          >
            {toml ?? block.text}
          </pre>
        </div>
      )
    }
    case 'list':
      return (
        <ul className="list-disc space-y-xs pl-xl text-meta">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )
    case 'paragraph':
      return <p className="text-meta text-pretty">{block.text}</p>
  }
}

/** The latest report: its day, a download of the file, and each section
 * in a fold of its own, all closed: the summary above is the answer, the
 * report the reference. */
export function Report({ report }: { report: EvaluationReport | null }) {
  if (report === null)
    return <p className="text-meta text-ink-2">{COPY.noReport}</p>
  const sections = tidyReport(parseReport(report.text), report.names)
  const file = `/operacoes/relatorio.md?data=${report.date}`
  return (
    <div className="flex flex-col gap-md border-t border-rule pt-xl">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <h3 className="font-display text-step-title">
          {COPY.report(report.date)}
        </h3>
        <a href={file} download className={buttonVariants({ variant: 'link' })}>
          {COPY.download}
        </a>
      </div>
      {sections.map((section) => (
        <Disclosure key={section.title} summary={section.title}>
          <div className="flex flex-col gap-md">
            {section.blocks
              .filter(
                (block) =>
                  section.title !== GRID_SECTION || block.kind !== 'code',
              )
              .map((block) => (
                <Block
                  key={blockKey(block)}
                  block={block}
                  weights={section.title === WEIGHTS_SECTION}
                />
              ))}
            {section.title === GRID_SECTION && (
              <p className="text-meta">
                {COPY.gridFile}{' '}
                <a
                  href={file}
                  download
                  className="underline underline-offset-3"
                >
                  {COPY.download}
                </a>
              </p>
            )}
          </div>
        </Disclosure>
      ))}
    </div>
  )
}
