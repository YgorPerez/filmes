// Idioma original [language] (P364): only when asked, passes the film that
// has the language asked among its original ones (`restricoes/idioma.py`).
// A film with no language in the Catálogo is out. The request holds by ISO
// code ("pt"), by name ("português") or by QID.

import { Effect } from 'effect'
import { casefold, pyStrip } from '../../compat/text.ts'
import { requestLine } from '../../evidence/Evidence.ts'
import { engineError } from '../../runtime/EngineError.ts'
import { text, textOrNull } from '../../sqlite/row.ts'
import {
  filmsJson,
  pass,
  type Constraint,
  type ConstraintModule,
  type Pass,
} from '../constraints.ts'

export interface LanguageRequest {
  /** `--idioma`: "pt", "português" or the QID. */
  readonly language?: string
}

const language = (asked: string): Constraint => ({
  name: 'language',
  toJson: () => ({ language: asked }),
  stored: () => ({ name: 'language', language: asked }),
  result: () => ({}),
  evaluate: (context, films) =>
    Effect.gen(function* () {
      const target = casefold(asked)
      const verdicts = new Map<string, Pass>()
      for (const row of yield* context.db.all(
        `SELECT * FROM idiomas_originais
           WHERE filme_id IN (SELECT value FROM json_each(?))
           ORDER BY filme_id, fato_id`,
        filmsJson(films),
      )) {
        const filmId = text(row, 'filme_id')
        if (verdicts.has(filmId)) continue
        const names = [
          textOrNull(row, 'codigo') ?? '',
          text(row, 'rotulo'),
          text(row, 'idioma_id'),
        ].map(casefold)
        if (names.includes(target))
          verdicts.set(
            filmId,
            pass([
              requestLine(
                filmId,
                `idioma original ${text(row, 'rotulo')}`,
                `${text(row, 'fonte')} P364`,
                textOrNull(row, 'data'),
                text(row, 'fato_id'),
              ),
            ]),
          )
      }
      return verdicts
    }),
})

export const languageModule: ConstraintModule<LanguageRequest> = {
  name: 'language',
  read: ({ language: asked }) =>
    Effect.gen(function* () {
      if (asked === undefined) return undefined
      const stripped = pyStrip(asked)
      if (!stripped)
        return yield* engineError('invalid_usage', '--idioma vazio')
      return language(stripped)
    }),
  label: (stored) => `idioma original: ${String(stored['language'])}`,
}
