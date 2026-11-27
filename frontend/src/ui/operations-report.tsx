import { useState } from 'react'
import type { EvaluationReport } from '#/platform/operations'
import { parseReport, weightsToml, type ReportBlock } from './evaluation-report'
import { buttonVariants } from './kit/button-variants'
import { Icon } from './kit/icon'
import { OPERATIONS } from './operations.copy'
import { Disclosure } from './operations-parts'

const COPY = OPERATIONS.evaluation

/** The section the report opens on; the others open on demand. */
const OPEN_SECTION = 'Offline'

/** The section whose YAML is today's weights, which copy back as TOML. */
const WEIGHTS_SECTION = 'Pesos'

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
        className={buttonVariants({ variant: 'option' })}
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

function Block({ block, weights }: { block: ReportBlock; weights: boolean }) {
  switch (block.kind) {
    case 'table':
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-meta tabular-nums [&_td]:px-sm [&_td]:py-xs [&_th]:px-sm [&_th]:py-xs">
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
                    ) : (
                      <td
                        key={block.head[i] ?? cell}
                        className={`whitespace-nowrap ${ALIGN[block.align[i] ?? 'left']}`}
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
          <pre className="max-h-[50vh] overflow-auto rounded-field bg-surface-2 p-md font-mono text-meta">
            {block.text}
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
 * in a fold of its own, the Offline one open. */
export function Report({ report }: { report: EvaluationReport | null }) {
  if (report === null)
    return <p className="text-meta text-ink-2">{COPY.noReport}</p>
  const sections = parseReport(report.text)
  return (
    <div className="flex flex-col gap-md border-t border-rule pt-xl">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <h3 className="font-display text-step-title">
          {COPY.report(report.date)}
        </h3>
        <a
          href={`/operacoes/relatorio.md?data=${report.date}`}
          download
          className={buttonVariants({ variant: 'link' })}
        >
          {COPY.download}
        </a>
      </div>
      {sections.map((section) => (
        <Disclosure
          key={section.title}
          summary={section.title}
          open={section.title === OPEN_SECTION}
        >
          <div className="flex flex-col gap-md">
            {section.blocks.map((block) => (
              <Block
                key={blockKey(block)}
                block={block}
                weights={section.title === WEIGHTS_SECTION}
              />
            ))}
          </div>
        </Disclosure>
      ))}
    </div>
  )
}
