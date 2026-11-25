import { PERSON } from '../person.copy'

// The tag beside the Dono's name, wherever the Pessoas are listed.

export function OwnerTag() {
  return (
    <span className="rounded-pill border border-rule px-2 py-0.5 font-display text-label text-ink-2 uppercase">
      {PERSON.owner}
    </span>
  )
}
