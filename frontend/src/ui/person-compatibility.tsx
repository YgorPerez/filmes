// The Compatibilidade on the Pessoa page (#403, map #395): each other
// Pessoa that shares enough rated films with her, most agreement first,
// with the films where the two agree and diverge most.
import type { Compatibility, CompatibilityFilm } from '@filmes/engine'
import { personPath } from '#/content/paths'
import { Slip } from './kit/slip'
import { Meta } from './person-parts'
import { COMPATIBILITY } from './person-compatibility.copy'

export function CompatibilitySection({
  name,
  viewer,
  compatibility,
}: {
  /** Hers, the Pessoa of the page. */
  name: string
  /** The logged-in Dono's slug: her own page is Meu gosto. */
  viewer: string
  compatibility: Compatibility
}) {
  const { others, minShared } = compatibility
  return (
    <Slip
      id="compatibilidade"
      title={COMPATIBILITY.title}
      aside={others.length > 0 ? String(others.length) : undefined}
      lead={others.length > 0 ? COMPATIBILITY.lead(name) : undefined}
    >
      {others.length === 0 ? (
        <p className="text-ink-2">{COMPATIBILITY.none(name, minShared)}</p>
      ) : (
        <ul className="flex flex-col">
          {others.map((other) => (
            <li
              key={other.person}
              className="flex flex-col gap-sm border-rule py-md not-first:border-t"
            >
              <p className="flex flex-wrap items-baseline gap-x-sm">
                <a
                  href={personPath(other.person, other.person === viewer)}
                  className="font-semibold text-ink"
                >
                  {other.name}
                </a>
                <Meta
                  parts={[
                    COMPATIBILITY.agreement(other.agreement),
                    COMPATIBILITY.shared(other.shared),
                  ]}
                />
              </p>
              <Films
                title={COMPATIBILITY.agree}
                films={other.agree}
                names={[name, other.name]}
              />
              <Films
                title={COMPATIBILITY.diverge}
                films={other.diverge}
                names={[name, other.name]}
              />
            </li>
          ))}
        </ul>
      )}
    </Slip>
  )
}

function Films({
  title,
  films,
  names: [mine, theirs],
}: {
  title: string
  films: readonly CompatibilityFilm[]
  names: readonly [string, string]
}) {
  if (films.length === 0) return null
  return (
    <div className="flex flex-col gap-2xs">
      <h3 className="text-meta-strong text-ink-2">{title}</h3>
      <ul className="flex flex-col gap-2xs">
        {films.map((film) => (
          <li key={film.filmId} className="flex flex-wrap gap-x-sm">
            <span>{COMPATIBILITY.film(film.title, film.year)}</span>
            <Meta
              parts={[
                COMPATIBILITY.ratings(mine, film.mine, theirs, film.theirs),
              ]}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
