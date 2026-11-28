import type {
  BillboardFilm,
  BillboardLine,
  BillboardNotes,
  BillboardPerson,
} from '@filmes/engine'
import { useState } from 'react'
import type { FilmMarks } from './billboard-marks'
import { Chip } from './kit/chip'
import { Hint } from './kit/hint'
import { Avatar } from './kit/person'
import { PriceSticker, Sticker } from './kit/sticker'
import { TapeCase } from './kit/tape-case'
import { BILLBOARD } from './billboard.copy'
import { BetStamp } from './billboard-bet'
import { ChosenReactions } from './billboard-chosen'
import { FilmMarksControls } from './billboard-card-marks'
import { Icon } from './billboard-icons'
import { AgainstMark, Strength } from './billboard-top'

// One film of the Cartaz (DESIGN.md, Card do filme): the tape in its case
// with the price sticker, the header (the synopsis, in English when TMDB
// has no pt-BR one, #385; the IMDb and, when TMDB has one, the trailer on
// YouTube: a link, never a player, #289), "Por que cada um
// vai gostar", opened by each Presente's Nota prevista (#326), and, while
// the Session takes a reply, the marks (`billboard-card-marks.tsx`). A grid:
// the case on the left (112px, 160px from 560px), the header on the right;
// "Por que" and the marks across below, each opened by a dashed rule, "Por
// que" going up under the chips from 560px. The state is the Cartaz's (`billboard.tsx`). Inside a
// section by Motivo (#183) the title is a level below the section's.

/** The outlined chips that leave the app: the IMDb and the trailer. The
 * link is 44px tall and the chip drawn inside it (#272, #277). */
const LINK_CHIP =
  'inline-flex min-h-touch items-center font-display text-chip font-bold text-ink tabular-nums no-underline'
const LINK_CHIP_FACE =
  'rounded-pill border-(length:--border-width-stroke) border-rule px-2.25 py-1'

/** The film's title level: 2 alone, 3 under a section's title. */
type Level = 2 | 3

const byslug = (people: readonly BillboardPerson[]) =>
  new Map(people.map((p) => [p.slug, p]))

/** Their names as the Cartaz says them: the Dono who looks is "Você"
 * (#277). */
const namesOf = (people: readonly BillboardPerson[]) => BILLBOARD.names(people)

/** The stamp on the cover: TROCAR, or JÁ VI with the initials of who saw
 * it when not every Presente did (#272). A Já visto the engine knows, with
 * no Já vi marked on this Cartaz, is VISTO ANTES with the initials of who
 * saw it, always: her Já vi option stays unpressed, and the stamp does not
 * say she marked it (#272). */
type Stamp =
  | { kind: 'swap' }
  | { kind: 'seen'; who: BillboardPerson[] }
  | { kind: 'seenBefore'; who: BillboardPerson[] }

function Poster({
  film,
  first,
  stamp,
  everyone,
}: {
  film: BillboardFilm
  first: boolean
  stamp: Stamp | null
  everyone: boolean
}) {
  const { card } = BILLBOARD
  // A poster that does not load gives way to the title, as none does: the
  // browser's clipped alt text never shows under the stickers (#272, #277).
  const [broken, setBroken] = useState(false)
  const cover = film.poster !== null && !broken
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
            {cover ? (
              <img
                src={film.poster}
                alt={card.poster(film.title)}
                loading={first ? 'eager' : 'lazy'}
                onError={() => setBroken(true)}
                // It may have failed before the page came alive.
                ref={(img) => {
                  if (img?.complete && img.naturalWidth === 0) setBroken(true)
                }}
                // The alt text is for a screen reader, never drawn.
                className="absolute inset-0 size-full object-cover text-transparent group-data-swap/card:opacity-70"
              />
            ) : (
              // The title on the top half: a stamp goes on the bottom one.
              <span className="self-start pt-lg text-center font-display text-row-title text-balance">
                {film.title}
              </span>
            )}
          </a>
        }
      />
      {stamp && (
        <Sticker
          kind={stamp.kind === 'swap' ? 'swap' : 'seen'}
          // As wide as the case and 4px a side, the turn adding the rest of
          // a sticker's 9px: the label and the dots wrap rather than spill
          // past the card's padding on a phone's 112px case (#351).
          className={`absolute left-1/2 inline-flex w-max max-w-[calc(100%+8px)] -translate-x-1/2 flex-wrap items-center justify-center gap-xs text-center ${cover ? 'top-[40%]' : 'top-[62%]'}`}
        >
          {stamp.kind === 'swap'
            ? card.swapStamp
            : stamp.kind === 'seen'
              ? card.seenStamp
              : card.seenBeforeStamp}
          {stamp.kind !== 'swap' &&
            (!everyone || stamp.kind === 'seenBefore') && (
              <>
                <span aria-hidden="true" className="inline-flex gap-0.5">
                  {stamp.who.map((p) => (
                    <Avatar key={p.slug} person={p} />
                  ))}
                </span>
                <span className="sr-only">
                  {(stamp.kind === 'seen'
                    ? card.seenStampWho
                    : card.seenBeforeStampWho)(stamp.who.map((p) => p.label))}
                </span>
              </>
            )}
        </Sticker>
      )}
      {film.bet && (
        <>
          <BetStamp className="absolute bottom-[17px] -left-sm">
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
      {/* The anchor of a tape on the home (`#filme-…`): room above for the
       * card's padding, the price sticker and a gutter (#271). */}
      <Title
        id={id}
        className="flex scroll-mt-10 flex-col gap-y-0.5 font-display text-title"
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
        // TMDB's English overview when it has no pt-BR one (#385): a screen
        // reader reads it in English.
        <p
          lang={film.synopsisLanguage}
          className="max-w-[60ch] text-synopsis text-pretty"
        >
          {film.synopsis}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-xs">
        {film.chips.map((chip) => (
          <Chip key={chip}>{chip}</Chip>
        ))}
        <a
          href={film.imdbUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK_CHIP}
        >
          <span className={LINK_CHIP_FACE}>
            {card.imdb(film.imdbRatingText, film.votesText)}
          </span>
        </a>
        {film.trailer && (
          <a
            href={film.trailer}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK_CHIP}
          >
            <span className={LINK_CHIP_FACE}>{card.trailer}</span>
          </a>
        )}
      </div>
      {(film.awards || film.curatedLists || film.critics) && (
        <ul className="text-meta text-ink-2">
          {[
            ...(film.awards ?? []),
            ...(film.curatedLists ?? []),
            ...(film.critics ?? []),
          ].map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** One line of "Por que": the Força, then whose it is and the engine's
 * text, with the Fonte below. A line against the film (a Já visto) says
 * "pesa contra" after it, never read as a reason to like it (#272). */
export function EvidenceLine({
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
        {line.against && (
          <>
            {' '}
            <AgainstMark />
          </>
        )}
        {line.source && (
          <span className="block text-source text-ink-2">{line.source}</span>
        )}
      </span>
    </li>
  )
}

/** Each Presente's Nota prevista, in the people's order, under the title
 * of "Por que": "previsto · Ana 8,3 · Iara 7,1". Her name carries the hint
 * of how many taste neighbours back it, when the version kept it. Who has
 * none is left out, and with nobody there is no line (#326). */
function Predicted({
  film,
  people,
}: {
  film: BillboardFilm
  people: readonly BillboardPerson[]
}) {
  const { card } = BILLBOARD
  const predicted = new Map(film.predictedRatings.map((p) => [p.person, p]))
  const shown = people.flatMap((person) => {
    const rating = predicted.get(person.slug)
    return rating ? [{ person, rating }] : []
  })
  if (shown.length === 0) return null
  return (
    <p className="text-meta text-ink-2 tabular-nums">
      {card.predicted}
      {shown.map(({ person, rating }) => {
        const hint =
          rating.raters === undefined ? null : card.predictedHint(rating.raters)
        return (
          <span key={person.slug}>
            {' · '}
            {hint === null ? (
              person.label
            ) : (
              <Hint label={card.predictedLabel(person.label, hint)} hint={hint}>
                {person.label}
              </Hint>
            )}{' '}
            {rating.text}
          </span>
        )
      })}
    </p>
  )
}

/** "Por que cada um vai gostar": its label is a label, never a heading,
 * so five cards do not make five equal headings (#277). A card with no
 * reason of its own (no line, no Nota prevista, no cautious Aposta) has no
 * block: its section's title says it (#272). */
function Why({
  film,
  people,
  open,
}: {
  film: BillboardFilm
  people: readonly BillboardPerson[]
  open: boolean
}) {
  const { card } = BILLBOARD
  const known = byslug(people)
  const without = film.withoutFact.flatMap((slug) => known.get(slug) ?? [])
  if (
    film.lines.length === 0 &&
    without.length === 0 &&
    film.predictedRatings.length === 0 &&
    !film.cautiousBetReason
  )
    return null
  return (
    <div className="col-span-2 flex flex-col gap-sm border-t border-dashed border-rule pt-lg min-[560px]:col-span-1 min-[560px]:col-start-2">
      <p className="flex justify-between gap-sm font-display text-label text-ink-2 uppercase">
        <span>{open ? card.why : card.whyClosed}</span>
        <span className="font-medium tracking-normal normal-case">
          {film.coverage}
        </span>
      </p>
      <Predicted film={film} people={people} />
      <ul aria-label={card.why} className="flex flex-col gap-2.25">
        {film.cautiousBetReason && (
          <li className="text-evidence text-ink-2">{film.cautiousBetReason}</li>
        )}
        {film.lines.map((line) => (
          <EvidenceLine
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

/** The stars and comments the Dono gave the film in this Session, kept
 * in sight after a redo and once it is closed (#272). */
function Notes({
  notes,
  marking,
}: {
  notes: BillboardNotes
  /** The Session takes marks: the stars are in their controls. */
  marking: boolean
}) {
  const { card } = BILLBOARD
  const stars = marking ? null : notes.stars
  if (stars === null && notes.comments.length === 0) return null
  return (
    <p className="col-span-2 flex flex-wrap items-center gap-x-sm gap-y-2xs text-meta text-ink-2 min-[560px]:col-span-1 min-[560px]:col-start-2">
      <span className="font-display text-label uppercase">
        {marking ? card.notesComments : card.notes}
      </span>
      {stars !== null && (
        <span className="inline-flex items-center gap-xs">
          <span
            role="img"
            aria-label={card.notesStars(stars)}
            className="inline-flex text-star"
          >
            {Array.from({ length: stars }, (_, i) => (
              <Icon key={i} name="star" className="size-4 fill-current" />
            ))}
          </span>
          <span aria-hidden="true">{card.notesStarsText(stars)}</span>
        </span>
      )}
      {notes.comments.map((comment) => (
        <q key={comment} className="text-ink">
          {comment}
        </q>
      ))}
    </p>
  )
}

/** Who marked Já vi, and who the engine knows saw it (#272); the poster's
 * stamp from them, or Trocar's. */
function stampOf(
  film: BillboardFilm,
  people: readonly BillboardPerson[],
  marks: FilmMarks | undefined,
): { seen: BillboardPerson[]; stamp: Stamp | null } {
  const marked = marks?.seen ?? []
  const seenBy = new Set([...marked, ...film.seen])
  const seen = people.filter((p) => seenBy.has(p.slug))
  const stamp: Stamp | null = marks?.swap
    ? { kind: 'swap' }
    : seen.length === 0
      ? null
      : marked.length > 0
        ? { kind: 'seen', who: seen }
        : { kind: 'seenBefore', who: seen }
  return { seen, stamp }
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
  reactionsOnTop = false,
}: {
  film: BillboardFilm
  people: readonly BillboardPerson[]
  first: boolean
  level?: Level
  marks?: FilmMarks
  onChange?: (marks: FilmMarks) => void
  /** The Cartaz's head says the chosen film's lines: the card keeps only
   * its label (#351). */
  reactionsOnTop?: boolean
}) {
  const { seen, stamp } = stampOf(film, people, marks)
  return (
    <article
      aria-labelledby={`filme-${film.id}`}
      data-swap={marks?.swap || undefined}
      className="group/card grid grid-cols-[112px_1fr] content-start gap-xl rounded-card border border-rule bg-surface px-xl pt-2xl pb-xl min-[560px]:grid-cols-[160px_1fr]"
    >
      <Poster
        film={film}
        first={first}
        stamp={stamp}
        everyone={seen.length === people.length}
      />
      <Header film={film} id={`filme-${film.id}`} level={level} />
      <Why film={film} people={people} open={marks !== undefined} />
      {film.notes && <Notes notes={film.notes} marking={marks !== undefined} />}
      {film.reactions && (
        <ChosenReactions
          reactions={film.reactions}
          people={people}
          level={level}
          labelOnly={reactionsOnTop}
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
