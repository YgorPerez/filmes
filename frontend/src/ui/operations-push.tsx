import type { PushStatus } from '@filmes/engine'
import { OPERATIONS } from './operations.copy'
import {
  ActionPost,
  Alert,
  Detail,
  Disclosure,
  Section,
} from './operations-parts'

const COPY = OPERATIONS.push

/** The commits waiting, newest first, by their subjects. */
function Queued({ status }: { status: PushStatus }) {
  if (status.queued.length === 0) return null
  return (
    <div className="flex flex-col gap-xs text-meta">
      <p className="text-ink-2">
        {COPY.queued(status.queued.length, status.pending)}
      </p>
      <ul className="list-disc space-y-2xs pl-xl">
        {status.queued.map((subject) => (
          <li key={subject} className="wrap-anywhere">
            {subject}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The queue: in a word while it is fine; while pushes fail, the run of
 * failures with when it began, what to do, the commits waiting, git's last
 * error on demand and a push now. After a push now (`retried`), the queue
 * line is the status that says how it went. A last error with no failure
 * means the queue itself could not be read. */
function PushQueue({
  status,
  retried,
}: {
  status: PushStatus
  retried: boolean
}) {
  const unreadable = status.failures === 0 && status.lastError !== null
  const failing = status.failures > 0
  const fine = status.pending === 0 && !failing
  const queue = fine
    ? COPY.upToDate(status.lastPushedAt)
    : COPY.pending(status.pending)
  return (
    <>
      {failing && (
        <Alert>
          <strong className="font-semibold">{COPY.failing}</strong>
          <Detail>
            {COPY.failures(status.failures)}{' '}
            {status.failingSince && COPY.since(status.failingSince)}
          </Detail>
        </Alert>
      )}
      {unreadable ? (
        <Alert>{COPY.unavailable}</Alert>
      ) : (
        <p
          role={retried ? 'status' : undefined}
          className={
            failing
              ? 'font-semibold tabular-nums'
              : 'text-meta text-ink-2 tabular-nums'
          }
        >
          {queue}
        </p>
      )}
      {failing && <p>{COPY.nextStep}</p>}
      {failing && <Queued status={status} />}
      {status.lastError && (
        <Disclosure summary={COPY.lastError}>
          <pre className="text-meta break-words whitespace-pre-wrap">
            {status.lastError}
          </pre>
        </Disclosure>
      )}
      {(status.pending > 0 || failing) && <ActionPost action="enviar" />}
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
        <p className="text-meta text-ink-2">
          {COPY.off}
          <Detail>
            <code>{COPY.remoteSetting}</code>
          </Detail>
        </p>
      )}
    </Section>
  )
}
