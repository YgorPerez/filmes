import type { SetupView } from '#/platform/setup-guide'
import { ConnectorBody, CopyAddress, StepList } from './home-parts'
import { guideSteps, isSkipped } from './setup-steps'
import { Slip } from './kit/slip'
import { MY_START } from './my-start.copy'

/** What Meu gosto shows of the setup guide: where she stands (null when
 * the engine cannot say) and the connector's address (null without
 * `APP_ORIGIN`). */
export type MyStart = { setup: SetupView | null; mcpUrl: string | null }

/** Meu gosto's part of the guide, after her Notas: the steps she skipped,
 * each with its "Retomar", and the connector's address. A skipped
 * connector shows its address behind its "Retomar", so the address is on
 * the page once. */
export function MyStartSections({
  start: { setup, mcpUrl },
  person,
}: {
  start: MyStart
  person: string
}) {
  const skipped = setup ? guideSteps(setup).filter(isSkipped) : []
  const connector = setup?.steps.find((s) => s.step === 'connector')
  return (
    <>
      {mcpUrl && !(connector && isSkipped(connector)) && (
        <Connector url={mcpUrl} done={connector?.done ?? false} />
      )}
      {setup && skipped.length > 0 && (
        <Slip
          id="pulados"
          title={MY_START.skipped.title}
          lead={MY_START.skipped.lead}
        >
          <StepList setup={setup} person={person} mcpUrl={mcpUrl} skippedOnly />
        </Slip>
      )}
    </>
  )
}

/** The connector's address, always there to copy: for a new phone, or
 * when the Claude app lost it. */
function Connector({ url, done }: { url: string; done: boolean }) {
  const { connector } = MY_START
  return (
    <Slip
      id="conector"
      title={connector.title}
      aside={done ? connector.state.done : connector.state.pending}
      lead={connector.lead}
    >
      <ConnectorBody url={url} done={done} />
      {done && <p className="text-evidence">{connector.done}</p>}
      <div className="flex flex-wrap items-center gap-xs">
        <CopyAddress url={url} label={MY_START.copyAddress} />
      </div>
    </Slip>
  )
}
