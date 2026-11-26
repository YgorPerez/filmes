import type { BillboardPerson, BillboardReaction } from '@filmes/engine'
import { CHOSEN } from './billboard-chosen.copy'

// The chosen film on a closed Cartaz (#264): below "Por que", opened by
// the same dashed rule, one line per Presente with the Nota prevista the
// version stored beside her Reação ("Ana: previsto 8,3 · gostou", "Bruno:
// previsto 7,1 · achou 6"). A Presente with only one of the two has that
// one; the engine leaves out who has neither.

/** The film's title level: 2 alone, 3 under a section's title. */
type Level = 2 | 3

/** One Presente's line: her name, then what was predicted and what came. */
const lineOf = (name: string, reaction: BillboardReaction) => {
  const parts = [
    reaction.predicted !== null && CHOSEN.predicted(reaction.predicted),
    reaction.rating !== null && CHOSEN.rating(reaction.rating),
    reaction.reaction !== null && CHOSEN.reaction[reaction.reaction],
  ].filter((part): part is string => typeof part === 'string')
  return CHOSEN.line(name, parts)
}

export function ChosenReactions({
  reactions,
  people,
  level = 2,
}: {
  reactions: readonly BillboardReaction[]
  people: readonly BillboardPerson[]
  level?: Level
}) {
  const Label = level === 3 ? 'h4' : 'h3'
  const names = new Map(people.map((p) => [p.slug, p.name]))
  if (reactions.length === 0) return null
  return (
    <div className="col-span-2 flex flex-col gap-sm border-t border-dashed border-rule pt-lg min-[560px]:col-span-1 min-[560px]:col-start-2">
      <Label className="font-display text-label text-ink-2 uppercase">
        {CHOSEN.title}
      </Label>
      <ul aria-label={CHOSEN.title} className="flex flex-col gap-xs">
        {reactions.map((reaction) => (
          <li
            key={reaction.person}
            className="text-evidence tabular-nums text-pretty"
          >
            {lineOf(names.get(reaction.person) ?? reaction.person, reaction)}
          </li>
        ))}
      </ul>
    </div>
  )
}
