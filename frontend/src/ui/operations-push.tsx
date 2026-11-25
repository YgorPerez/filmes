import type { PushStatus } from '@filmes/engine'
import { OPERATIONS } from './operations.copy'
import { ActionPost } from './operations-parts'
import { Alert, Section, Submit } from './person-parts'

const COPY = OPERATIONS.push

/** The push's state, line by line: what waits, how many failures, since
 * when, and what git said last. */
function PushLines({ status }: { status: PushStatus }) {
  if (!status.enabled) return <p className="text-ink-2">{COPY.off}</p>
  const lines = [
    status.pending === 0 ? COPY.ok : COPY.pending(status.pending),
    status.failures > 0 && COPY.failures(status.failures),
    status.failingSince && COPY.since(status.failingSince),
  ].filter((line) => typeof line === 'string')
  return (
    <div className="flex flex-col gap-md">
      <ul className="flex flex-col gap-2xs">
        {lines.map((line) => (
          <li key={line} className="flex items-baseline gap-sm tabular-nums">
            <span
              aria-hidden="true"
              className={`size-2 shrink-0 translate-y-[-1px] rounded-round ${status.pending === 0 && status.failures === 0 ? 'bg-ink-2' : 'border-[1.5px] border-ink'}`}
            />
            {line}
          </li>
        ))}
      </ul>
      {status.lastError && (
        <div className="flex flex-col gap-xs">
          <span className="font-display text-label text-ink-2 uppercase">
            {COPY.lastError}
          </span>
          <pre className="overflow-x-auto rounded-field bg-case p-lg font-mono text-meta whitespace-pre-wrap text-case-ink">
            {status.lastError}
          </pre>
        </div>
      )}
    </div>
  )
}

/** The push of filmes-dados (#121): the queue and the failures, with a
 * push now. `status` is null when the engine cannot run here. */
export function PushSection({ status }: { status: PushStatus | null }) {
  return (
    <Section id="envio" title={COPY.title} lead={COPY.lead}>
      {status === null ? (
        <Alert>{COPY.unavailable}</Alert>
      ) : (
        <>
          {status.alert && (
            <Alert>{COPY.banner(status.pending, status.failures)}</Alert>
          )}
          <PushLines status={status} />
          {status.enabled && (
            <ActionPost action="enviar">
              <Submit>{COPY.retry}</Submit>
            </ActionPost>
          )}
        </>
      )}
    </Section>
  )
}

/** The banner on every Dono page of an admin while pushes keep failing
 * (`alert`, after three in a row). */
export function PushBanner({ status }: { status: PushStatus }) {
  return (
    <div role="alert" className="bg-surface-2 text-ink">
      <p className="mx-auto flex max-w-[720px] items-start gap-sm px-2xl py-md text-meta">
        <span aria-hidden="true" className="font-bold">
          ⚠
        </span>
        <span>
          {COPY.banner(status.pending, status.failures)}{' '}
          <a
            href="/operacoes#envio"
            className="font-semibold whitespace-nowrap underline underline-offset-3"
          >
            {COPY.bannerLink}
          </a>
        </span>
      </p>
    </div>
  )
}
