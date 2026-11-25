/** The letreiro, DESIGN.md's signature: a lit panel framed in marquee red,
 * one word per plate in Antonio. Screen readers get the whole text from the
 * `aria-label`; the plates are hidden from them (The Words In Plates Rule). */
export function Marquee({
  words,
  label,
}: {
  words: readonly string[]
  /** What a screen reader hears, when not the words in a row. */
  label?: string
}) {
  return (
    <div
      role="img"
      aria-label={label ?? words.join(' ')}
      className="inline-flex flex-wrap gap-xs self-start rounded-panel border-3 border-marquee-red bg-marquee-panel px-3 pt-2.5 pb-[9px]"
    >
      {words.map((word) => (
        <span
          key={word}
          aria-hidden="true"
          className="rounded-plate bg-marquee-ink/5 px-1.5 py-1 font-letter text-letter text-marquee-ink uppercase"
        >
          {word}
        </span>
      ))}
    </div>
  )
}
