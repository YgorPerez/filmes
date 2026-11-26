import type {
  BillboardFilm,
  BillboardLine,
  BillboardPerson,
} from '@filmes/engine'
import type { FilmMarks } from './billboard-marks'
import { Chip } from './kit/chip'
import { Avatar, PersonDot } from './kit/person'
import { PriceSticker, Sticker } from './kit/sticker'
import { TapeCase } from './kit/tape-case'
import { BILLBOARD } from './billboard.copy'
import { BetStamp } from './billboard-bet'
import { FilmMarksControls } from './billboard-card-marks'
import { Strength } from './billboard-top'

// One film of the Cartaz (DESIGN.md, Card do filme): the tape in its case
// with the price sticker and a dot per Presente, the header, "Por que cada
// um vai gostar" and, while the Session takes a reply, the marks
// (`billboard-card-marks.tsx`). A grid: the case on the left (112px, 160px
// from 560px), the header on the right; "Por que" and the marks across
// below, each opened by a dashed rule, "Por que" going up under the chips
// from 560px. The state is the Cartaz's (`billboard.tsx`).

const byslug = (people: readonly BillboardPerson[]) =>
  new Map(people.map((p) => [p.slug, p]))

const namesOf = (people: readonly BillboardPerson[]) =>
  people.map((p) => p.name).join(', ')

function Poster({
  film,
  people,
  first,
  stamp,
}: {
  film: BillboardFilm
  people: readonly BillboardPerson[]
  first: boolean
  stamp: 'swap' | 'seen' | null
}) {
  const { card } = BILLBOARD
  const without = new Set(film.withoutFact)
  return (
    <a
      href={film.imdbUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="relative self-start no-underline min-[560px]:row-span-2"
    >
      <TapeCase
        className="w-full"
        cover={
          film.poster ? (
            <img
              src={film.poster}
              alt={card.poster(film.title)}
              loading={first ? 'eager' : 'lazy'}
              className="absolute inset-0 size-full object-cover group-data-swap/card:opacity-70"
            />
          ) : (
            <span>{film.title}</span>
          )
        }
      >
        {people.map((p) => {
          const hollow = without.has(p.slug)
          return (
            <PersonDot
              key={p.slug}
              person={p}
              hollow={hollow}
              title={hollow ? card.noFact(p.name) : p.name}
            />
          )
        })}
      </TapeCase>
      {stamp && (
        <Sticker
          kind={stamp}
          className="absolute top-[40%] left-1/2 -translate-x-1/2"
        >
          {stamp === 'swap' ? card.swapStamp : card.seenStamp}
        </Sticker>
      )}
      {film.new && (
        <Sticker kind="new" className="absolute top-sm -right-md">
          {card.isNew}
        </Sticker>
      )}
      {film.bet && (
        <BetStamp
          hint={card.betHint}
          className="absolute bottom-[38px] -left-sm"
        >
          {card.bet}
        </BetStamp>
      )}
      <PriceSticker className="absolute -top-[9px] -left-[9px]">
        {film.position}
      </PriceSticker>
    </a>
  )
}

function Header({ film, id }: { film: BillboardFilm; id: string }) {
  const { card } = BILLBOARD
  return (
    <div className="flex min-w-0 flex-col gap-sm">
      <h2 id={id} className="flex flex-col gap-y-0.5 font-display text-title">
        <span className="sr-only">{film.position}</span>
        <span>{film.title}</span>
        {film.originalTitle && (
          <span className="font-body text-meta text-ink-2">
            {film.originalTitle}
          </span>
        )}
      </h2>
      {film.synopsis && (
        <p className="max-w-[60ch] text-synopsis text-pretty">
          {film.synopsis}
        </p>
      )}
      <div className="flex flex-wrap gap-xs">
        {film.chips.map((chip) => (
          <Chip key={chip}>{chip}</Chip>
        ))}
        <a
          href={film.imdbUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-pill border-[1.5px] border-rule px-[9px] py-[4px] font-display text-chip font-bold text-ink tabular-nums no-underline"
        >
          {card.imdb(film.imdbRatingText, film.votesText)}
        </a>
      </div>
    </div>
  )
}

// Avatar, Força, the engine's text: 34px, 28px and the rest.
const LINE = 'grid grid-cols-[minmax(34px,auto)_28px_1fr] gap-xs text-evidence'

/** One avatar, or the same Evidência's avatars overlapping with a ring of
 * the card's surface between them. */
function Avatars({
  people,
  hollow = false,
}: {
  people: readonly BillboardPerson[]
  hollow?: boolean
}) {
  return (
    <span aria-label={namesOf(people)} className="flex">
      {people.map((p, i) => (
        <span
          key={p.slug}
          className={i > 0 ? '-ml-[7px] rounded-round ring-2 ring-surface' : ''}
        >
          <Avatar person={p} hollow={hollow} />
        </span>
      ))}
    </span>
  )
}

function Line({
  line,
  people,
}: {
  line: BillboardLine
  people: ReadonlyMap<string, BillboardPerson>
}) {
  const who = line.people.flatMap((slug) => people.get(slug) ?? [])
  return (
    <li className={LINE}>
      <Avatars people={who} />
      <span className="pt-[7px]">
        <Strength strength={line.strength} />
      </span>
      <span>
        {line.text}
        {line.source && (
          <span className="block text-source text-ink-2">{line.source}</span>
        )}
      </span>
    </li>
  )
}

function Why({
  film,
  people,
}: {
  film: BillboardFilm
  people: readonly BillboardPerson[]
}) {
  const { card } = BILLBOARD
  const known = byslug(people)
  const without = film.withoutFact.flatMap((slug) => known.get(slug) ?? [])
  return (
    <div className="col-span-2 flex flex-col gap-sm border-t border-dashed border-rule pt-lg min-[560px]:col-span-1 min-[560px]:col-start-2">
      <h3 className="flex justify-between gap-sm font-display text-label text-ink-2 uppercase">
        {card.why}
        <span className="font-medium tracking-normal normal-case">
          {film.coverage}
        </span>
      </h3>
      <ul className="flex flex-col gap-[9px]">
        {film.lines.map((line) => (
          <Line
            key={`${line.people.join(' ')}:${line.text}`}
            line={line}
            people={known}
          />
        ))}
        {without.length > 0 && (
          <li className={`${LINE} text-ink-2`}>
            <Avatars people={without} hollow />
            <span />
            <span>{card.withoutFact(namesOf(without))}</span>
          </li>
        )}
      </ul>
    </div>
  )
}

/** A film of the Cartaz. `marks` and `onChange` are absent when the
 * Session takes no reply (it has its Feedback). */
export function BillboardCard({
  film,
  people,
  first,
  marks,
  onChange,
}: {
  film: BillboardFilm
  people: readonly BillboardPerson[]
  first: boolean
  marks?: FilmMarks
  onChange?: (marks: FilmMarks) => void
}) {
  const allSeen =
    marks !== undefined &&
    people.length > 0 &&
    marks.seen.length === people.length
  const stamp = marks?.swap ? 'swap' : allSeen ? 'seen' : null
  return (
    <article
      aria-labelledby={`filme-${film.id}`}
      data-swap={marks?.swap || undefined}
      className="group/card grid grid-cols-[112px_1fr] content-start gap-xl rounded-card border border-rule bg-surface px-xl pt-2xl pb-xl min-[560px]:grid-cols-[160px_1fr]"
    >
      <Poster film={film} people={people} first={first} stamp={stamp} />
      <Header film={film} id={`filme-${film.id}`} />
      <Why film={film} people={people} />
      {marks && onChange && (
        <FilmMarksControls
          film={film}
          people={people}
          marks={marks}
          onChange={onChange}
        />
      )}
    </article>
  )
}
