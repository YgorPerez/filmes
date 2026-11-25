// The part of Python's argparse the CLI uses, so the argv adapter reads a
// step's arguments as `python -m filmes` does: `--opt value` and
// `--opt=value`, flags, `action="append"`, `nargs="?"` with a `const`,
// `nargs="+"` (with or without `action="extend"`), positionals (optional with `nargs="?"`), `choices`,
// `required`, mutually exclusive groups, `--` and unique prefixes of a long
// option (argparse's `allow_abbrev`).
//
// The messages are not argparse's: the oracle compares only the code of an
// `invalid_usage`. Types (`type=int`, `type=Path`) are the command's job.

export type OptionSpec =
  /** `action="store_true"`: a boolean. */
  | { readonly kind: 'flag' }
  /** One value: a string, `undefined` when absent. */
  | {
      readonly kind: 'value'
      readonly required?: boolean
      readonly choices?: readonly string[]
    }
  /** `nargs="?"` with `const`: the value, `const` when given with none,
   * `undefined` when absent. */
  | { readonly kind: 'optional'; readonly const: string }
  /** `action="append"`: every occurrence, `[]` when absent. */
  | { readonly kind: 'append' }
  /** `nargs="+"`: the values of the last occurrence. */
  | { readonly kind: 'list'; readonly required?: boolean }
  /** `nargs="+", action="extend"`: the values of every occurrence, `[]`
   * when absent. */
  | { readonly kind: 'extend' }

export interface PositionalSpec {
  readonly name: string
  /** `nargs="?"`. */
  readonly optional?: boolean
  readonly choices?: readonly string[]
}

export interface ArgSpec {
  readonly positionals?: readonly PositionalSpec[]
  /** By the long option's name without `--` (`presentes`, `sem-lento`). */
  readonly options?: Readonly<Record<string, OptionSpec>>
  /** `add_mutually_exclusive_group`, by option names. */
  readonly exclusive?: ReadonlyArray<{
    readonly options: readonly string[]
    readonly required?: boolean
  }>
}

type OptionValue<O> = O extends { readonly kind: 'flag' }
  ? boolean
  : O extends { readonly kind: 'value'; readonly required: true }
    ? string
    : O extends { readonly kind: 'value' | 'optional' }
      ? string | undefined
      : O extends { readonly kind: 'list'; readonly required: true }
        ? readonly string[]
        : O extends { readonly kind: 'list' }
          ? readonly string[] | undefined
          : readonly string[]

type PositionalValue<P> = P extends { readonly optional: true }
  ? string | undefined
  : string

type Positionals<S extends ArgSpec> =
  S['positionals'] extends readonly (infer P)[]
    ? {
        readonly [
          Q in P as Q extends { readonly name: infer N extends string }
            ? N
            : never
        ]: PositionalValue<Q>
      }
    : unknown

type Options<S extends ArgSpec> =
  S['options'] extends Readonly<Record<string, OptionSpec>>
    ? { readonly [K in keyof S['options']]: OptionValue<S['options'][K]> }
    : unknown

/** What argparse's namespace would hold, by positional and option name. */
export type Parsed<S extends ArgSpec> = Positionals<S> & Options<S>

/** Arguments argparse would refuse (it exits with `uso_invalido`). */
export class ArgvError extends Error {
  override readonly name = 'ArgvError'
}

const NEGATIVE_NUMBER = /^-\d+$|^-\d*\.\d+$/

/** Whether argparse reads `token` as an option rather than a value. */
const isOption = (token: string): boolean =>
  token.startsWith('-') && token !== '-' && !NEGATIVE_NUMBER.test(token)

function resolveOption(
  options: Readonly<Record<string, OptionSpec>>,
  name: string,
): string {
  if (Object.hasOwn(options, name)) return name
  const matches = Object.keys(options).filter((known) => known.startsWith(name))
  if (matches.length === 1 && matches[0] !== undefined) return matches[0]
  if (matches.length > 1)
    throw new ArgvError(`ambiguous option: --${name} (${matches.join(', ')})`)
  throw new ArgvError(`unrecognized arguments: --${name}`)
}

/** Reads `argv` (the command's own arguments, after the command words) as
 * argparse would with `spec`. Throws an `ArgvError` where argparse fails. */
export function parseArgv<const S extends ArgSpec>(
  argv: readonly string[],
  spec: S,
): Parsed<S> {
  const options = spec.options ?? {}
  const values: Record<string, unknown> = {}
  const given = new Set<string>()
  const positionals: string[] = []
  let onlyPositionals = false

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string
    if (!onlyPositionals && token === '--') {
      onlyPositionals = true
      continue
    }
    if (onlyPositionals || !isOption(token)) {
      positionals.push(token)
      continue
    }
    if (!token.startsWith('--'))
      throw new ArgvError(`unrecognized arguments: ${token}`)
    const equals = token.indexOf('=')
    const name = resolveOption(
      options,
      equals === -1 ? token.slice(2) : token.slice(2, equals),
    )
    const inline = equals === -1 ? undefined : token.slice(equals + 1)
    const option = options[name] as OptionSpec
    given.add(name)

    if (option.kind === 'flag') {
      if (inline !== undefined)
        throw new ArgvError(`argument --${name}: ignored explicit argument`)
      values[name] = true
      continue
    }
    if (option.kind === 'list' || option.kind === 'extend') {
      const taken: string[] = []
      if (inline !== undefined) taken.push(inline)
      else
        while (i + 1 < argv.length && !isOption(argv[i + 1] as string))
          taken.push(argv[++i] as string)
      if (taken.length === 0)
        throw new ArgvError(
          `argument --${name}: expected at least one argument`,
        )
      values[name] =
        option.kind === 'extend'
          ? [...((values[name] as string[] | undefined) ?? []), ...taken]
          : taken
      continue
    }
    if (option.kind === 'optional') {
      const next = argv[i + 1]
      if (inline !== undefined) values[name] = inline
      else if (next !== undefined && !isOption(next)) {
        values[name] = next
        i++
      } else values[name] = option.const
      continue
    }
    let value = inline
    if (value === undefined) {
      const next = argv[i + 1]
      if (next === undefined || isOption(next))
        throw new ArgvError(`argument --${name}: expected one argument`)
      value = next
      i++
    }
    if (option.kind === 'append') {
      values[name] = [...((values[name] as string[] | undefined) ?? []), value]
      continue
    }
    if (option.choices && !option.choices.includes(value))
      throw new ArgvError(`argument --${name}: invalid choice: '${value}'`)
    values[name] = value
  }

  for (const positional of spec.positionals ?? []) {
    const value = positionals.shift()
    if (value === undefined) {
      if (!positional.optional)
        throw new ArgvError(
          `the following arguments are required: ${positional.name}`,
        )
      values[positional.name] = undefined
      continue
    }
    if (positional.choices && !positional.choices.includes(value))
      throw new ArgvError(
        `argument ${positional.name}: invalid choice: '${value}'`,
      )
    values[positional.name] = value
  }
  if (positionals.length > 0)
    throw new ArgvError(`unrecognized arguments: ${positionals.join(' ')}`)

  for (const [name, option] of Object.entries(options)) {
    if (given.has(name)) continue
    if ('required' in option && option.required)
      throw new ArgvError(`the following arguments are required: --${name}`)
    values[name] =
      option.kind === 'flag'
        ? false
        : option.kind === 'append' || option.kind === 'extend'
          ? []
          : undefined
  }
  for (const group of spec.exclusive ?? []) {
    const used = group.options.filter((name) => given.has(name))
    if (used.length > 1)
      throw new ArgvError(
        `argument --${used[1]}: not allowed with argument --${used[0]}`,
      )
    if (group.required && used.length === 0)
      throw new ArgvError(
        `one of the arguments ${group.options.map((o) => `--${o}`).join(' ')} is required`,
      )
  }
  return values as Parsed<S>
}
