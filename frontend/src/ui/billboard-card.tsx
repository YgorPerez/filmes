import type {
  BillboardFilm,
  BillboardLine,
  BillboardPerson,
} from '@filmes/engine'
import type { FilmMarks } from './billboard-marks'
import { Chip } from './kit/chip'
import { PersonDot } from './kit/person'
import { PriceSticker, Sticker } from './kit/sticker'
import { TapeCase } from './kit/tape-case'
import { BILLBOARD } from './billboard.copy'
import { BetStamp } from './billboard-bet'
import { ChosenReactions } from './billboard-chosen'
import { FilmMarksControls } from './billboard-card-marks'
import { Strength } from './billboard-top'

// One film of the Cartaz (DESIGN.md, Card do filme): the tape in its case
// with the price sticker and a dot per Presente with her Nota prevista, the
// header, "Por que cada um vai gostar" and, while the Session takes a reply, the marks
// (`billboard-card-marks.tsx`). A grid: the case on the left (112px, 160px
// from 560px), the header on the right; "Por que" and the marks across
// below, each opened by a dashed rule, "Por que" going up under the chips
// from 560px. The state is the Cartaz's (`billboard.tsx`). Inside a
// section by Motivo (#183) the title is a level below the section's.

/** The film's title level: 2 alone, 3 under a section's title. */
type Level = 2 | 3

const byslug = (people: readonly BillboardPerson[]) =>
  new Map(people.map((p) => [p.slug, p]))

const namesOf = (people: readonly BillboardPerson[]) =>
  BILLBOARD.card.whose(people.map((p) => p.name))

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
  const predicted = new Map(film.predictedRatings.map((p) => [p.person, p]))
  return (
    <div className="relative self-start min-[560px]:row-span-2">
      <TapeCase
        className="w-full"
        cover={
          <a
            href={film.imdbUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute inset-0 grid place-items-center p-md text-ink-2 no-underline"
          >
            {film.poster ? (
              <img
                src={film.poster}
                alt={card.poster(film.title)}
                loading={first ? 'eager' : 'lazy'}
                className="absolute inset-0 size-full object-cover group-data-swap/card:opacity-70"
              />
            ) : (
              <span>{film.title}</span>
            )}
          </a>
        }
      >
        {people.map((p) => {
          const rating = predicted.get(p.slug)
          return (
            <PersonDot
              key={p.slug}
              person={p}
              hollow={without.has(p.slug)}
              rating={
                rating && {
                  text: rating.text,
                  hint: card.predicted(p.name, rating.text, rating.raters),
                }
              }
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
        <>
          <BetStamp className="absolute bottom-[38px] -left-sm">
            {card.bet}
          </BetStamp>
          <span className="sr-only">{card.betHint}</span>
        </>
      )}
      <PriceSticker className="absolute -top-[9px] -left-[9px]">
        {film.position}
      </PriceSticker>
    </div>
  )
}

function Header({
  film,
  id,
  level,
}: {
  film: BillboardFilm
  id: string
  level: Level
}) {
  const { card } = BILLBOARD
  const Title = level === 3 ? 'h3' : 'h2'
  return (
    <div className="flex min-w-0 flex-col gap-sm">
      <Title
        id={id}
        className="flex flex-col gap-y-0.5 font-display text-title"
      >
        <span className="sr-only">{film.position}</span>
        <span>{film.title}</span>
        {film.originalTitle && (
          <span className="font-body text-meta text-ink-2">
            {film.originalTitle}
          </span>
        )}
      </Title>
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
          className="rounded-pill border-(length:--border-width-stroke) border-rule px-2.25 py-1 font-display text-chip font-bold text-ink tabular-nums no-underline"
        >
          {card.imdb(film.imdbRatingText, film.votesText)}
        </a>
      </div>
      {film.awards && (
        <ul className="text-meta text-ink-2">
          {film.awards.map((award) => (
            <li key={award}>{award}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** One line of "Por que": the Força, then whose it is and the engine's
 * text, with the Fonte below. */
function Line({
  line,
  people,
}: {
  line: BillboardLine
  people: ReadonlyMap<string, BillboardPerson>
}) {
  const who = line.people.flatMap((slug) => people.get(slug) ?? [])
  return (
    <li className="grid grid-cols-[28px_1fr] gap-xs text-evidence">
      <span className="flex h-lh items-center">
        <Strength strength={line.strength} />
      </span>
      <span>
        {who.length > 0 && (
          <>
            <span className="font-semibold">{namesOf(who)}:</span>{' '}
          </>
        )}
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
  level,
}: {
  film: BillboardFilm
  people: readonly BillboardPerson[]
  level: Level
}) {
  const { card } = BILLBOARD
  const Label = level === 3 ? 'h4' : 'h3'
  const known = byslug(people)
  const without = film.withoutFact.flatMap((slug) => known.get(slug) ?? [])
  return (
    <div className="col-span-2 flex flex-col gap-sm border-t border-dashed border-rule pt-lg min-[560px]:col-span-1 min-[560px]:col-start-2">
      <Label className="flex justify-between gap-sm font-display text-label text-ink-2 uppercase">
        {card.why}
        <span className="font-medium tracking-normal normal-case">
          {film.coverage}
        </span>
      </Label>
      <ul aria-label={card.why} className="flex flex-col gap-2.25">
        {film.cautiousBetReason && (
          <li className="text-evidence text-ink-2">{film.cautiousBetReason}</li>
        )}
        {film.lines.map((line) => (
          <Line
            key={`${line.people.join(' ')}:${line.text}`}
            line={line}
            people={known}
          />
        ))}
        {without.length > 0 && (
          <li className="text-evidence text-ink-2">
            {card.withoutFact(namesOf(without))}
          </li>
        )}
      </ul>
    </div>
  )
}

/** A film of the Cartaz. `marks` and `onChange` are absent when the
 * Session takes no reply (it has its Feedback). `level` 3 under a
 * section's title. */
export function BillboardCard({
  film,
  people,
  first,
  level = 2,
  marks,
  onChange,
}: {
  film: BillboardFilm
  people: readonly BillboardPerson[]
  first: boolean
  level?: Level
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
      <Header film={film} id={`filme-${film.id}`} level={level} />
      <Why film={film} people={people} level={level} />
      {film.reactions && (
        <ChosenReactions
          reactions={film.reactions}
          people={people}
          level={level}
        />
      )}
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
