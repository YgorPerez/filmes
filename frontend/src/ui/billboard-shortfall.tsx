import type { Billboard as BillboardModel } from '@filmes/engine'

/** The Falta [shortfall] strip at the top of the Cartaz (#357): fewer
 * films passed than asked, or a Restrição was relaxed to fill the list,
 * and the engine says which ("Acabaram os parecidos com Home Alone;
 * entraram 3 de antes de 1990"), so the list never shrinks in silence.
 * Nothing with a full list or once the Session is closed. */
export function ShortfallStrip({ billboard }: { billboard: BillboardModel }) {
  if (!billboard.open || !billboard.shortfall) return null
  return (
    <p
      role="note"
      className="rounded-card border border-rule bg-surface px-md py-sm text-meta text-pretty text-ink"
    >
      {billboard.shortfall}
    </p>
  )
}
