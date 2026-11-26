import type {
  BillboardChosen,
  BillboardPerson,
  BillboardReaction,
} from '@filmes/engine'
import { CHOSEN } from './billboard-chosen.copy'

// The chosen film on a closed Cartaz (#264): below "Por que", opened by
// the same dashed rule, one line per Presente with the Nota prevista the
// version stored beside her Reação ("Ana: previsto 8,3 · gostou", "Bruno:
// previsto 7,1 · achou 6"). A Presente with only one of the two has that
// one; the engine leaves out who has neither. A chosen film with no card
// (outside the Recomendação, or not among the films shown) has a block of
// its own above the cards, `ChosenFilm`, with its title and the same lines.

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

/** The Presentes' lines, under a title of the caller's. */
function Lines({
  reactions,
  people,
}: {
  reactions: readonly BillboardReaction[]
  people: readonly BillboardPerson[]
}) {
  const names = new Map(people.map((p) => [p.slug, p.name]))
  return (
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
  )
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
  if (reactions.length === 0) return null
  return (
    <div className="col-span-2 flex flex-col gap-sm border-t border-dashed border-rule pt-lg min-[560px]:col-span-1 min-[560px]:col-start-2">
      <Label className="font-display text-label text-ink-2 uppercase">
        {CHOSEN.title}
      </Label>
      <Lines reactions={reactions} people={people} />
    </div>
  )
}

/** The chosen film when no card shows it: its title, then each line.
 * Nothing when a card shows it or there is none. */
export function ChosenFilm({
  chosen,
  people,
}: {
  chosen: BillboardChosen | undefined
  people: readonly BillboardPerson[]
}) {
  if (!chosen) return null
  const id = `escolhido-${chosen.id}`
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-sm rounded-card border border-rule bg-surface p-xl"
    >
      <h2 id={id} className="font-display text-label text-ink-2 uppercase">
        {CHOSEN.title}
      </h2>
      <p className="font-display text-title">
        {CHOSEN.film(chosen.title, chosen.year)}
      </p>
      {chosen.reactions.length > 0 && (
        <Lines reactions={chosen.reactions} people={people} />
      )}
    </section>
  )
}
