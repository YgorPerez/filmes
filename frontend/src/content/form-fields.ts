// Reading a plain HTML form the same way on every Dono screen (Pessoas,
// Imports, Feedback): a text field trimmed, with empty as absent, and the
// values a field or a query may hold. Client-safe: the pages and the
// server both use it.

/** The field's text, trimmed; undefined when absent, empty or a file. */
export const field = (form: FormData, name: string): string | undefined => {
  const value = form.get(name)
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/** The non-empty values of a repeated field (checkboxes), once each. */
export const all = (form: FormData, name: string): string[] => [
  ...new Set(
    form
      .getAll(name)
      .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
      .map((v) => v.trim()),
  ),
]

/** Whether the post asks for the Catálogo search of the field `name`:
 * by its button ("Buscar", `buscar-catalogo=sim`), or by Enter (the form's
 * default button, `tecla=enter`) while the field holds text the page has
 * not searched yet (`buscado`, what the field came back with). Enter
 * elsewhere, with nothing new to search, sends the form. */
export const searchAsked = (form: FormData, name: string): boolean => {
  if (form.get('buscar-catalogo') === 'sim') return true
  const typed = field(form, name)
  return (
    form.get('tecla') === 'enter' &&
    typed !== undefined &&
    typed !== field(form, 'buscado')
  )
}

/** The value when it is one of `values`. */
export const oneOf = <T extends string>(
  values: readonly T[],
  value: string | undefined,
): T | undefined => values.find((v) => v === value)

/** A guard for a closed list: what a page keeps from its query. */
export const within =
  <T extends string>(values: readonly T[]) =>
  (value: unknown): value is T =>
    (values as readonly unknown[]).includes(value)
