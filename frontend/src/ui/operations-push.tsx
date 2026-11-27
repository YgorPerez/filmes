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

/** The commits waiting, newest first, by their subjects: the engine's
 * operation as it ran ("pessoa criar Lia"), so in code type. */
function Queued({ status }: { status: PushStatus }) {
  return (
    <ul className="list-disc space-y-2xs pl-xl text-meta">
      {status.queued.map((subject) => (
        <li key={subject} className="wrap-anywhere">
          <code className="font-mono">{subject}</code>
        </li>
      ))}
    </ul>
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
  const failing = status.failures > 0
  const listed = failing && status.queued.length > 0
  return (
    <>
      {failing && <Failing status={status} />}
      <QueueLine status={status} retried={retried} />
      {listed && <Queued status={status} />}
      {failing && <p>{COPY.nextStep}</p>}
      {status.lastError && (
        <Disclosure summary={COPY.lastError}>
          <pre className="text-meta break-words whitespace-pre-wrap">
            {status.lastError}
          </pre>
        </Disclosure>
      )}
      {(status.pending > 0 || failing) && (
        <ActionPost action="enviar" primary={failing} />
      )}
    </>
  )
}

/** The run of failures and when it began. */
function Failing({ status }: { status: PushStatus }) {
  return (
    <Alert>
      <strong className="font-semibold">{COPY.failing}</strong>
      <Detail>
        {COPY.failures(status.failures)}{' '}
        {status.failingSince && COPY.since(status.failingSince)}
      </Detail>
    </Alert>
  )
}

/** The queue in a line, or that it could not be read. */
function QueueLine({
  status,
  retried,
}: {
  status: PushStatus
  retried: boolean
}) {
  const failing = status.failures > 0
  if (!failing && status.lastError !== null)
    return <Alert>{COPY.unavailable}</Alert>
  const fine = status.pending === 0 && !failing
  const listed = failing && status.queued.length > 0
  const queue = fine
    ? COPY.upToDate(status.lastPushedAt)
    : listed
      ? COPY.pendingList(status.pending, status.queued.length)
      : COPY.pending(status.pending)
  return (
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
