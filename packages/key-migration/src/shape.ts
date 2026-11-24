// The shape of a migrated document: which keys a map may have, what each one
// is called in English, and which scalars are closed lists. Tables are written
// once, Portuguese to English; `invert` derives the other direction, so the
// two can never drift apart.

/** A closed list: Portuguese value → English value. */
export type Values = Readonly<Record<string, string>>

export type Scalar =
  /** Kept as written: free text, ids, numbers, dates. */
  | 'free'
  /** A closed list. `open` lets values outside it through unchanged (a Veto
   * target is a tag group, renamed, or a Catalog id, kept). */
  | { readonly values: Values; readonly open?: boolean }

export interface Shape {
  /** A map with known keys. A key outside the table is an error. */
  readonly fields?: Readonly<Record<string, Field>>
  /** A map whose keys are data (ids, Clima names): every value has this
   * shape and the keys stay. */
  readonly entries?: Shape
  /** A list, each item with this shape. */
  readonly items?: Shape
  readonly scalar?: Scalar
}

export interface Field {
  readonly name: string
  readonly shape: Shape
}

export const free: Shape = { scalar: 'free' }

/** A value that is free in any form: a scalar, a list or a map of scalars,
 * kept as written (the `restricoes` parameters, a recorded answer). */
export const anything: Shape = {
  scalar: 'free',
  items: { scalar: 'free' },
}

export function closed(values: Values, open = false): Shape {
  return { scalar: { values, open } }
}

export function list(items: Shape): Shape {
  return { items }
}

export function entries(shape: Shape): Shape {
  return { entries: shape }
}

/** A map. Each field is `pt: 'en'` (a free scalar) or `pt: ['en', shape]`. */
export function map(
  fields: Readonly<Record<string, string | readonly [string, Shape]>>,
): Shape {
  const out: Record<string, Field> = {}
  for (const [pt, field] of Object.entries(fields))
    out[pt] =
      typeof field === 'string'
        ? { name: field, shape: free }
        : { name: field[0], shape: field[1] }
  return { fields: out }
}

/** The shapes a value may take, merged: `oneOf(free, map(...))` is a
 * scalar or a map. */
export function oneOf(...shapes: readonly Shape[]): Shape {
  return Object.assign({}, ...shapes) as Shape
}

function invertTable(table: Values, where: string): Values {
  const out: Record<string, string> = {}
  for (const [pt, en] of Object.entries(table)) {
    if (en in out)
      throw new Error(
        `${where}: '${out[en]}' and '${pt}' both become '${en}', so the way back is ambiguous`,
      )
    out[en] = pt
  }
  return out
}

const inverted = new WeakMap<Shape, Shape>()

/** The same shape read the other way: English keys and values to
 * Portuguese. Fails when two Portuguese names share an English one. */
export function invert(shape: Shape, where = '$'): Shape {
  const cached = inverted.get(shape)
  if (cached) return cached
  const out: {
    fields?: Record<string, Field>
    entries?: Shape
    items?: Shape
    scalar?: Scalar
  } = {}
  inverted.set(shape, out)
  if (shape.fields) {
    const names = invertTable(
      Object.fromEntries(
        Object.entries(shape.fields).map(([pt, f]) => [pt, f.name]),
      ),
      where,
    )
    out.fields = Object.fromEntries(
      Object.entries(names).map(([en, pt]) => [
        en,
        { name: pt, shape: invert(shape.fields![pt]!.shape, `${where}.${en}`) },
      ]),
    )
  }
  if (shape.entries) out.entries = invert(shape.entries, `${where}.*`)
  if (shape.items) out.items = invert(shape.items, `${where}[]`)
  if (shape.scalar)
    out.scalar =
      shape.scalar === 'free'
        ? 'free'
        : {
            values: invertTable(shape.scalar.values, where),
            open: shape.scalar.open ?? false,
          }
  return out
}
