import { useId, useRef } from 'react'
import { encode } from 'uqr'
import { buttonVariants } from './kit/button-variants'
import { SESSION_QR } from './session-link.copy'

// "Mostrar QR" (#396): the Link da Sessão as a QR code, full screen, so
// the Presentes in the TV room join from their phones. The web Cartaz and
// the MCP Apps view show the same piece; the code is drawn here, from the
// link alone, so nothing leaves the page.

/** The link's modules as one SVG path, a unit square per dark module,
 * with a quiet zone of 2 modules on paper. */
function qrPath(url: string) {
  const { data, size } = encode(url, { ecc: 'M', border: 2 })
  const squares = data.flatMap((row, y) =>
    row.flatMap((dark, x) => (dark ? [`M${x} ${y}h1v1h-1z`] : [])),
  )
  return { d: squares.join(''), size }
}

/** The code itself: the case's ink on the shelf label's paper, both the
 * same in the dark theme, so any phone camera reads it. */
function QrCode({ url }: { url: string }) {
  const { d, size } = qrPath(url)
  return (
    <svg
      role="img"
      aria-label={SESSION_QR.image}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className="aspect-square w-full bg-shelf-label text-case"
    >
      <path d={d} fill="currentColor" />
    </svg>
  )
}

/** The button and, while `open`, the full-screen dialog. The owner keeps
 * `open`, so the dialog outlives a change of layout: in the MCP Apps view,
 * the inline card's button asks the host for its fullscreen too, and the
 * code opens there, not in a strip of the chat. */
export function SessionQr({
  url,
  open,
  onOpen,
  onClose,
}: {
  url: string
  open: boolean
  onOpen: () => void
  onClose: () => void
}) {
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        className={buttonVariants({ variant: 'option' })}
        onClick={onOpen}
      >
        {SESSION_QR.show}
      </button>
      {open && <QrDialog url={url} onClose={onClose} />}
    </>
  )
}

/** Opens as a modal once mounted; Esc and Fechar close it. */
function QrDialog({ url, onClose }: { url: string; onClose: () => void }) {
  const heading = useId()
  const dialog = useRef<HTMLDialogElement | null>(null)
  return (
    <dialog
      ref={(element) => {
        dialog.current = element
        if (element && !element.open) element.showModal()
      }}
      aria-labelledby={heading}
      onClose={onClose}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-ground p-lg text-ink backdrop:bg-ground"
    >
      <div className="mx-auto flex h-full max-w-[560px] flex-col items-center justify-center gap-lg pt-(--host-inset-top) pb-(--host-inset-bottom) text-center">
        <h2 id={heading} className="font-display text-page-title">
          {SESSION_QR.title}
        </h2>
        <p className="text-ink-2">{SESSION_QR.lead}</p>
        <div className="w-full max-w-[min(100%,calc(100dvh-280px))] min-w-[160px] rounded-card border border-rule bg-shelf-label p-sm">
          <QrCode url={url} />
        </div>
        {/* A button, not a `method="dialog"` form: on the web the dialog
            sits inside the Cartaz's form. */}
        <button
          type="button"
          className={buttonVariants({ variant: 'option' })}
          onClick={() => dialog.current?.close()}
        >
          {SESSION_QR.close}
        </button>
      </div>
    </dialog>
  )
}
