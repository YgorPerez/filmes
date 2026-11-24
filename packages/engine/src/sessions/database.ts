// The database's copy of the Sessions, derived from their files
// (`sessao/banco.py`). A rebuild loads them all (`reloadSessions`, the
// loading step `40_sessoes`); a write of one Session file syncs that one
// (`syncSession`) in the same transaction, so the next Recomendação sees
// its Fatos without a rebuild. The rows keep Python's Portuguese values
// (`padrao`, `nota`, `gostou`).

import { Effect } from 'effect'
import {
  pyStrValue,
  isMapping,
  isPyInt,
  pyTruthy,
  isSequence,
  type YamlMapping,
  type YamlValue,
} from '../data/yaml.ts'
import type { EngineError } from '../runtime/EngineError.ts'
import type { Environment } from '../runtime/Environment.ts'
import { Sqlite, type Connection, type SqliteError } from '../sqlite/Sqlite.ts'
import { comments, reactions, REPORT_LEVELS, sessionSeen } from './facts.ts'
import { readSession, sessionIds } from './file.ts'
import type { RuleName } from '../recommendation/rule.ts'

/** A Regra's name as `sessoes.regra` keeps it. */
export const DB_RULES: Readonly<Record<RuleName, string>> = {
  default: 'padrao',
  average: 'media',
  by: 'de',
}

const SESSION_TABLES = [
  'notas',
  'ja_visto',
  'reacoes',
  'declarados',
  'sessao_presentes',
  'sessao_recomendacao',
] as const

/** A frontmatter scalar as sqlite3 binds it: an int as an integer, text
 * as text, None as NULL. */
const bind = (
  value: YamlValue | undefined,
): string | number | bigint | null => {
  if (value === undefined || value === null) return null
  if (isPyInt(value)) return value.int
  if (typeof value === 'boolean') return value ? 1 : 0
  return pyStrValue(value)
}

/** The Dono slugs a Session's Fatos are told by: the Session's `owner`,
 * or, in a file without one (the #10 prototype), every Pessoa with
 * `dono = 1`, as Python. */
const ownersOf = (db: Connection, front: YamlMapping) =>
  Effect.gen(function* () {
    const owner = front.get('owner')
    if (pyTruthy(owner)) return new Set([pyStrValue(owner ?? null)])
    const rows = yield* db.all(
      'SELECT slug FROM pessoas WHERE dono = 1 ORDER BY slug',
    )
    return new Set(rows.map((row) => String(row['slug'])))
  })

/** Replaces one Session's rows with its frontmatter's (`banco.carregar`). */
export const syncSession = (
  db: Connection,
  id: string,
  front: YamlMapping,
): Effect.Effect<void, EngineError | SqliteError> =>
  Effect.gen(function* () {
    for (const table of SESSION_TABLES)
      yield* db.run(`DELETE FROM ${table} WHERE sessao = ?`, id)
    yield* db.run('DELETE FROM sessoes WHERE id = ?', id)

    const rule = front.get('rule')
    const ruleOf = isMapping(rule) ? rule : new Map<string, YamlValue>()
    const ruleName = ruleOf.get('name')
    const feedback = front.get('feedback')
    const context = front.get('context')
    yield* db.run(
      `INSERT INTO sessoes (id, data, regra, regra_pessoa, pedido, escolhido, escolhido_na_recomendacao, feedback_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      pyStrValue(front.get('date') ?? null),
      ruleName === undefined
        ? 'padrao'
        : (DB_RULES[ruleName as RuleName] ?? bind(ruleName)),
      bind(ruleOf.get('person')),
      isMapping(context) ? bind(context.get('request')) : null,
      bind(front.get('chosen')),
      bind(front.get('chosen_in_recommendation')),
      pyTruthy(feedback) && isMapping(feedback)
        ? pyStrValue(feedback.get('recorded_on') ?? null)
        : null,
    )
    const attendees = front.get('attendees')
    for (const person of isSequence(attendees) ? attendees : [])
      yield* db.run(
        'INSERT INTO sessao_presentes (sessao, pessoa) VALUES (?, ?)',
        id,
        bind(person),
      )
    const recommendation = front.get('recommendation')
    for (const item of isSequence(recommendation) ? recommendation : [])
      if (isMapping(item))
        yield* db.run(
          'INSERT INTO sessao_recomendacao (sessao, posicao, filme_id) VALUES (?, ?, ?)',
          id,
          bind(item.get('position')),
          bind(item.get('id')),
        )
    for (const r of yield* reactions(id, front)) {
      const level = r.reaction === null ? null : REPORT_LEVELS[r.reaction].db
      yield* db.run(
        `INSERT INTO reacoes (fato_id, sessao, pessoa, filme_id, tipo, nota, reacao, repassada, valor, data, fonte)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        r.factId,
        r.session,
        r.person,
        r.filmId,
        r.kind === 'rating' ? 'nota' : 'relato',
        r.rating,
        level,
        r.relayed ? 1 : 0,
        r.value,
        r.date,
        r.source,
      )
      if (r.kind === 'rating')
        yield* db.run(
          'INSERT INTO notas (fato_id, pessoa, filme_id, nota, data, fonte, sessao) VALUES (?, ?, ?, ?, ?, ?, ?)',
          r.factId,
          r.person,
          r.filmId,
          r.rating,
          r.date,
          r.source,
          r.session,
        )
    }
    const owners = yield* ownersOf(db, front)
    for (const c of comments(id, front, owners))
      yield* db.run(
        `INSERT INTO declarados (fato_id, pessoa, data, fonte, especifico, reacao, alvo, rotulo, texto, sessao)
         VALUES (?, ?, ?, ?, 1, ?, ?, (SELECT titulo FROM filmes WHERE id = ?), ?, ?)`,
        c.factId,
        c.person,
        c.date,
        c.source,
        c.reaction,
        c.filmId,
        c.filmId,
        c.text,
        c.session,
      )
    for (const v of sessionSeen(id, front, owners))
      yield* db.run(
        'INSERT INTO ja_visto (fato_id, pessoa, filme_id, tipo, data, fonte, sessao) VALUES (?, ?, ?, ?, ?, ?, ?)',
        v.factId,
        v.person,
        v.filmId,
        v.kind,
        v.date,
        v.source,
        v.session,
      )
  })

/** Reloads every Session's rows from filmes-dados (`banco.carregar_todas`):
 * the start of a server whose database was built before the latest
 * writes. Returns the ids loaded. A Session whose file is gone keeps its
 * rows, as after a sync. */
export const reloadSessions: Effect.Effect<
  ReadonlyArray<string>,
  EngineError | SqliteError,
  Environment | Sqlite
> = Effect.gen(function* () {
  const ids = yield* sessionIds
  return yield* (yield* Sqlite).write((db) =>
    Effect.gen(function* () {
      for (const id of ids) {
        const { frontmatter } = yield* readSession(id)
        yield* syncSession(db, id, frontmatter)
      }
      return ids
    }),
  )
})
