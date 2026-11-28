import type { TasteAnalysis, TasteItem } from '@filmes/engine'
import { FoldRow } from './kit/fold-row'
import { Slip } from './kit/slip'
import { Item, Meta } from './person-parts'
import { TASTE_ANALYSIS } from './person-taste-analysis.copy'

// The taste analysis on the Pessoa page (#404), next to her Notas and the
// prediction error: the genres, directors, actors and decades she rates
// above her own median, each a fold with the films and Notas behind it.

const GROUPS = ['genres', 'directors', 'actors', 'decades'] as const

export function TasteAnalysisSlip({
  analysis,
  own,
  name,
}: {
  analysis: TasteAnalysis
  /** Meu gosto speaks to her. */
  own: boolean
  name: string
}) {
  const copy = TASTE_ANALYSIS
  const groups = GROUPS.filter((group) => analysis[group].length > 0)
  return (
    <Slip
      id="analise-do-gosto"
      title={copy.title(own, name)}
      lead={copy.lead(own, name, analysis.median, analysis.ratings)}
    >
      {groups.length === 0 && <p className="text-ink-2">{copy.empty}</p>}
      {groups.map((group) => (
        <section
          key={group}
          aria-labelledby={`analise-${group}`}
          className="flex flex-col"
        >
          <h3
            id={`analise-${group}`}
            className="font-display text-label text-ink-2 uppercase"
          >
            {copy.groups[group]}
          </h3>
          {analysis[group].map((item, i) => (
            <TasteFold
              key={item.key}
              item={item}
              label={group === 'decades' ? copy.decade(item.label) : item.label}
              first={i === 0}
            />
          ))}
        </section>
      ))}
    </Slip>
  )
}

/** One item: its mean and count on the fold, its films inside. */
function TasteFold({
  item,
  label,
  first,
}: {
  item: TasteItem
  label: string
  first: boolean
}) {
  const copy = TASTE_ANALYSIS
  const hidden = item.count - item.films.length
  return (
    <FoldRow summary={copy.item(label, item.mean, item.count)} rule={!first}>
      <ul className="flex flex-col">
        {item.films.map((film) => (
          <Item key={film.filmId}>
            <span>{copy.film(film.title ?? film.filmId, film.year)}</span>
            <Meta parts={[copy.rating(film.rating)]} />
          </Item>
        ))}
      </ul>
      {hidden > 0 && (
        <p className="text-meta text-ink-2">{copy.more(hidden)}</p>
      )}
    </FoldRow>
  )
}
