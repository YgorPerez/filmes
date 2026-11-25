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
    <div className="flex flex-col gap-xs">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {status.lastError && (
        <div className="flex flex-col gap-xs">
          <span className="text-label text-ink-2 uppercase">
            {COPY.lastError}
          </span>
          <pre className="overflow-x-auto rounded-field bg-surface-2 p-sm text-meta whitespace-pre-wrap">
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
    <div className="mx-auto max-w-[720px] px-lg pt-xl">
      <Alert>
        {COPY.banner(status.pending, status.failures)}{' '}
        <a href="/operacoes#envio" className="font-semibold underline">
          {COPY.bannerLink}
        </a>
      </Alert>
    </div>
  )
}
