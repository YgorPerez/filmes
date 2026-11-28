// The query of the Pessoas list (`/pessoas`), for its route and its
// screen. A Pessoa's own page has hers in `person-action.ts`.

/** Why `/pessoas` shows a refusal: the Pessoa of a form is gone
 * (`pessoa`), or the one whose CSV was asked for (`baixar`). */
export type PeopleRefusal = 'pessoa' | 'baixar'
export const isPeopleRefusal = (value: unknown): value is PeopleRefusal =>
  value === 'pessoa' || value === 'baixar'

/** What `/pessoas` says after a Pessoa was taken out (`?feito=removida`). */
export const isPeopleNotice = (value: unknown): value is 'removida' =>
  value === 'removida'
