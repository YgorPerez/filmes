import type { PushStatus } from '@filmes/engine'
import { OPERATIONS } from './operations.copy'
import { ActionPost, Detail } from './operations-parts'
import { Alert, Section } from './person-parts'

const COPY = OPERATIONS.push

/** The queue, the run of failures with when it began, git's last error
 * on demand, and a push now. After a push now (`retried`), the queue line
 * is the status that says how it went. A last error with no failure means
 * the queue itself could not be read. */
function PushQueue({
  status,
  retried,
}: {
  status: PushStatus
  retried: boolean
}) {
  const unreadable = status.failures === 0 && status.lastError !== null
  const queue =
    status.pending === 0 && status.failures === 0
      ? COPY.ok
      : COPY.pending(status.pending)
  return (
    <>
      {status.failures > 0 && <Alert>{COPY.failing}</Alert>}
      {unreadable ? (
        <Alert>{COPY.unavailable}</Alert>
      ) : (
        <div
          className="flex flex-col gap-xs"
          role={retried ? 'status' : undefined}
        >
          <p className="font-semibold tabular-nums">{queue}</p>
          {status.failures > 0 && (
            <p className="text-meta text-ink-2">
              {COPY.failures(status.failures)}{' '}
              {status.failingSince && COPY.since(status.failingSince)}
            </p>
          )}
        </div>
      )}
      {status.lastError && (
        <details className="rounded-field border border-rule">
          <summary className="min-h-touch cursor-pointer content-center px-lg font-semibold">
            {COPY.lastError}
          </summary>
          <pre className="border-t border-rule p-lg text-meta break-words whitespace-pre-wrap">
            {status.lastError}
          </pre>
        </details>
      )}
      {(status.pending > 0 || status.failures > 0) && (
        <ActionPost action="enviar" />
      )}
    </>
  )
}

/** The push of filmes-dados (#121). `status` is null when the engine
 * cannot run here. */
export function PushSection({
  status,
  retried,
}: {
  status: PushStatus | null
  retried: boolean
}) {
  return (
    <Section id="envio" title={COPY.title} lead={COPY.lead}>
      {status === null ? (
        <Alert>{COPY.unavailable}</Alert>
      ) : status.enabled ? (
        <PushQueue status={status} retried={retried} />
      ) : (
        <p className="text-ink-2">
          {COPY.off}
          <Detail>
            <code>{COPY.remoteSetting}</code>
          </Detail>
        </p>
      )}
    </Section>
  )
}
