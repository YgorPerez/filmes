// The watchlist [watchlist] of the stored exports (#280). Each Letterboxd
// or Trakt export holds the whole watchlist of its day, so the latest one
// that carries a watchlist file says what she wants to see now: a film she
// took off the list stops counting. The other rows add up across exports.

/** One stored export's rows, and whether it had a watchlist file (an empty
 * one included). */
export interface ExportRows<Row> {
  readonly rows: readonly Row[]
  readonly hasWatchlist: boolean
}

/** The rows of every export, in record order, keeping the watchlist rows of
 * the latest export with a watchlist file only. */
export const withLatestWatchlist = <Row>(
  exports: readonly ExportRows<Row>[],
  isWatchlist: (row: Row) => boolean,
): Row[] => {
  const latest = exports.findLastIndex((e) => e.hasWatchlist)
  return exports.flatMap((e, i) =>
    i === latest ? [...e.rows] : e.rows.filter((row) => !isWatchlist(row)),
  )
}
