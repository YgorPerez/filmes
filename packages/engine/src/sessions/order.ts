// The order of Sessions (`sessao/arquivo.py` `ordem`): by date, then by id,
// with the numeric suffix of a second Session on the same day
// ("2026-11-20-bruno-2") compared as a number, so "-10" comes after "-9".

/** Python's `ordem(registro)`: `(date, base, suffix)`, where a Session
 * with no numeric suffix is suffix 1. */
export const sessionOrder = (session: {
  readonly id: string
  readonly date: string
}): readonly [string, string, bigint] => {
  const dash = session.id.lastIndexOf('-')
  const base = dash < 0 ? '' : session.id.slice(0, dash)
  const suffix = session.id.slice(dash + 1)
  if (Array.from(base).length > 10 && /^[0-9]+$/.test(suffix))
    return [session.date, base, BigInt(suffix)]
  return [session.date, session.id, 1n]
}
