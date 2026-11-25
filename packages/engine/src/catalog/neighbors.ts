// Item-item neighbourhood from the MovieLens ratings of 4 or more
// (`catalogo/vizinhos.py` `calcular`). It is the one rule: the Catalog
// (`vizinhos`, #106) and the offline evaluation (`avaliar`) call it, so the
// evaluation measures the neighbourhood that goes to production.
//
// Python builds a scipy CSR matrix and multiplies a batch of rows by its
// transpose; here the same counts come from typed arrays: for a film, each
// user who gave it 4+ adds one to every other film she gave 4+. The counts
// are integers, so the result is exact; ties break by column, as Python's
// `argpartition` on `column − count × films` does (risk R15 of #76).

/** Neighbours kept per film. */
export const TOP_K = 50
/** Rows per progress step (Python's `LOTE`). */
export const BATCH = 128

/** `(film, neighbour, base, both)`: `base` is how many distinct users gave
 * the film 4+, `both` how many gave 4+ to both. */
export type NeighborPair = readonly [string, string, number, number]

export interface NeighborOptions {
  /** Only these rows (indexes into `films`). */
  readonly seeds?: Iterable<number>
  /** Called before each batch with (rows done, rows in all). */
  readonly onBatch?: (done: number, total: number) => void
}

/** Rows of a CSR built from (row, column) pairs, each column once per row,
 * columns ascending. */
const csr = (
  rows: number,
  rowOf: Int32Array,
  columnOf: Int32Array,
): { readonly start: Int32Array; readonly columns: Int32Array } => {
  const counts = new Int32Array(rows + 1)
  for (const row of rowOf) counts[row + 1]! += 1
  for (let i = 0; i < rows; i++) counts[i + 1]! += counts[i]!
  const fill = counts.slice(0, rows)
  const columns = new Int32Array(rowOf.length)
  for (let i = 0; i < rowOf.length; i++)
    columns[fill[rowOf[i]!]!++] = columnOf[i]!
  // Sort each row and drop repeats (scipy sums them, then `data.fill(1)`).
  const start = new Int32Array(rows + 1)
  let out = 0
  for (let row = 0; row < rows; row++) {
    start[row] = out
    const slice = columns.subarray(counts[row]!, counts[row + 1]!).sort()
    for (let i = 0; i < slice.length; i++)
      if (i === 0 || slice[i] !== slice[i - 1]) columns[out++] = slice[i]!
  }
  start[rows] = out
  return { start, columns: columns.slice(0, out) }
}

/** The `TOP_K` neighbours of each film (or of each seed row), as
 * `(film, neighbour, base, both)`, neighbours in id order.
 *
 * `items[i]` and `users[i]` are one 4+ vote: the film's index in `films`
 * and the user. */
export function* computeNeighbors(
  films: readonly string[],
  items: Int32Array,
  users: Int32Array,
  options: NeighborOptions = {},
): Generator<NeighborPair> {
  if (users.length === 0) return
  let userCount = 0
  for (const user of users) if (user + 1 > userCount) userCount = user + 1
  const byFilm = csr(films.length, items, users)
  const byUser = csr(userCount, users, items)
  const rows =
    options.seeds === undefined
      ? films.map((_, i) => i)
      : [...new Set(options.seeds)].sort((a, b) => a - b)
  const counts = new Int32Array(films.length)
  const touched: number[] = []
  for (let first = 0; first < rows.length; first += BATCH) {
    options.onBatch?.(first, rows.length)
    for (const item of rows.slice(first, first + BATCH)) {
      for (let u = byFilm.start[item]!; u < byFilm.start[item + 1]!; u++) {
        const user = byFilm.columns[u]!
        for (let j = byUser.start[user]!; j < byUser.start[user + 1]!; j++) {
          const other = byUser.columns[j]!
          if (counts[other] === 0) touched.push(other)
          counts[other]! += 1
        }
      }
      const others = touched.filter((other) => other !== item)
      others.sort((a, b) => counts[b]! - counts[a]! || a - b)
      const chosen = others.slice(0, TOP_K).sort((a, b) => a - b)
      const base = byFilm.start[item + 1]! - byFilm.start[item]!
      for (const other of chosen)
        yield [films[item]!, films[other]!, base, counts[other]!]
      for (const other of touched) counts[other] = 0
      touched.length = 0
    }
  }
}
