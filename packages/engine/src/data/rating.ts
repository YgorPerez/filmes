// The Nota [Rating] as the Dono writes it (`filmes/dados/nota.py`): "4",
// "4,5" and "4.5" are the scale of 0,5 to 5; "9/10" is the scale of 10,
// from 1 to 10, worth half.

import { Effect } from 'effect'
import { pyFormatG } from '../compat/number.ts'
import { pyParseFloat } from '../compat/parse.ts'
import { pyReprStr, pyStrip } from '../compat/text.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'

export interface ReadRating {
  /** On the scale of 0,5 to 5. */
  readonly rating: number
  /** "9/10" when it came on the scale of 10, as it is shown back. */
  readonly tenScale: string | null
}

/** A Nota as the text shows it: 5 is "5", 4.5 is "4,5" (`texto.nota`). */
export const formatRating = (value: number): string =>
  pyFormatG(value).replace('.', ',')

const parse = (text: string): number | null => {
  try {
    return pyParseFloat(pyStrip(text).replaceAll(',', '.'))
  } catch {
    return null
  }
}

/** Reads a Nota the Dono wrote; anything else is `invalid_usage`. */
export const readRating = (
  text: string,
): Effect.Effect<ReadRating, EngineError> =>
  Effect.suspend((): Effect.Effect<ReadRating, EngineError> => {
    const stripped = pyStrip(text)
    const slash = stripped.indexOf('/')
    const number = slash === -1 ? stripped : stripped.slice(0, slash)
    const scale = slash === -1 ? null : stripped.slice(slash + 1)
    const value = parse(number)
    if (value === null || (scale !== null && pyStrip(scale) !== '10'))
      return Effect.fail(
        engineError(
          'invalid_usage',
          `nota inválida: ${pyReprStr(text)} (use de 0,5 a 5, ou de 1 a 10 com "/10")`,
        ),
      )
    if (scale !== null) {
      if (!(value >= 1 && value <= 10))
        return Effect.fail(
          engineError(
            'invalid_usage',
            `nota de 1 a 10 fora da escala: ${pyReprStr(text)}`,
          ),
        )
      return Effect.succeed({
        rating: value / 2,
        tenScale: `${formatRating(value)}/10`,
      })
    }
    if (!(value >= 0.5 && value <= 5)) {
      const hint =
        value >= 1 && value <= 10
          ? ` (se é de 1 a 10, escreva "${stripped}/10")`
          : ''
      return Effect.fail(
        engineError(
          'invalid_usage',
          `nota fora da escala de 0,5 a 5: ${pyReprStr(text)}${hint}`,
        ),
      )
    }
    return Effect.succeed({ rating: value, tenScale: null })
  })
