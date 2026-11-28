import { Effect } from 'effect'
import { authorOf, DataWriter } from '../data/DataWriter.ts'
import { isSequence, pyStrValue } from '../data/yaml.ts'
import { savePersonAndSync } from '../people/actions.ts'
import { readPeople, resolvePerson } from '../people/people.ts'
import { items, removeItem } from '../people/Person.ts'
import { engineError } from '../runtime/EngineError.ts'
import { Run } from '../runtime/Run.ts'
import { Sqlite, type Connection } from '../sqlite/Sqlite.ts'
import { clearSession, syncSession } from './database.ts'
import { billboardSource } from './facts.ts'
import { eraseSessionFile, readSession, writeSession } from './file.ts'
import { discardWaitingAnswers } from './pairwise.ts'

export type DeleteSessionRequest = {
  readonly session: string
  /** Omit the choice when confirming deletion of a Session without Fatos. */
  readonly mode?: 'keep_taste' | 'erase'
}

const deletionRefused = () =>
  engineError(
    'invalid_usage',
    'Só um Dono que esteve nesta Sessão pode excluí-la.',
  )

const deletionOwner = Effect.gen(function* () {
  const owner = yield* resolvePerson('dono')
  if (!owner.owner) return yield* deletionRefused()
  return owner
})

const deletableSession = (id: string, owner: string) =>
  Effect.gen(function* () {
    const file = yield* readSession(id)
    const attendees = file.frontmatter.get('attendees')
    if (
      !isSequence(attendees) ||
      !attendees.some((person) => pyStrValue(person) === owner)
    )
      return yield* deletionRefused()
    return file
  })

const hasFacts = (db: Connection, id: string) =>
  Effect.map(
    db.get(
      `SELECT 1 FROM ja_visto WHERE sessao = ?1 OR fonte = ?2
       UNION ALL SELECT 1 FROM notas WHERE sessao = ?1 OR fonte = ?2
       UNION ALL SELECT 1 FROM declarados WHERE sessao = ?1 OR fonte = ?2
       UNION ALL SELECT 1 FROM reacoes WHERE sessao = ?1
       LIMIT 1`,
      id,
      billboardSource(id),
    ),
    (row) => row !== undefined,
  )

/** What the Dono needs to confirm before deleting the Session. */
export const sessionDeletion = (id: string) =>
  Effect.gen(function* () {
    const owner = yield* deletionOwner
    yield* deletableSession(id, owner.slug)
    return {
      hasFacts: yield* (yield* Sqlite).read((db) => hasFacts(db, id)),
    }
  })

/** The Cartaz writes its Já vistos and Declarados into the Pessoas' files,
 * unlike the Feedback. Erasing removes those too. Recorded pairwise
 * answers have a different Fonte and stay. */
const eraseBillboardFacts = (db: Connection, id: string) =>
  Effect.gen(function* () {
    const source = billboardSource(id)
    const rows = yield* db.all(
      `SELECT pessoa FROM ja_vistos WHERE fonte = ?1
       UNION SELECT pessoa FROM declarados WHERE fonte = ?1`,
      source,
    )
    if (rows.length === 0) return
    const slugs = new Set(rows.map((row) => String(row['pessoa'])))
    for (const person of yield* readPeople) {
      if (!slugs.has(person.slug)) continue
      let updated = person
      for (const seen of yield* items(person, 'seen'))
        if (seen.source === source)
          updated = yield* removeItem(updated, 'seen', seen)
      for (const stated of yield* items(person, 'stated'))
        if (stated.source === source)
          updated = yield* removeItem(updated, 'stated', stated)
      if (updated !== person) yield* savePersonAndSync(db, updated)
    }
  })

/** Deletes a Session, by a Dono who was there. All file changes and the
 * derived rows go through the same write as the Dono's commit. */
export const deleteSession = ({ session: id, mode }: DeleteSessionRequest) =>
  Effect.gen(function* () {
    const owner = yield* deletionOwner
    const { today } = yield* Run
    const writer = yield* DataWriter
    return yield* writer.write(
      { author: authorOf(owner), message: `delete session ${id}` },
      (db) =>
        Effect.gen(function* () {
          const stillOwner = yield* db.get(
            'SELECT 1 FROM pessoas WHERE slug = ? AND dono = 1',
            owner.slug,
          )
          if (!stillOwner) return yield* deletionRefused()
          const { frontmatter, body } = yield* deletableSession(id, owner.slug)
          const anyFacts = yield* hasFacts(db, id)
          if (anyFacts && mode !== 'keep_taste' && mode !== 'erase')
            return yield* engineError(
              'invalid_usage',
              'Escolha se quer manter ou apagar os Fatos da Sessão.',
            )
          if (anyFacts && mode === 'keep_taste') {
            const front = new Map(frontmatter)
            discardWaitingAnswers(front, today)
            front.set('deleted_on', today)
            yield* syncSession(db, id, front)
            yield* writeSession(id, front, body)
          } else {
            yield* clearSession(db, id)
            if (anyFacts) yield* eraseBillboardFacts(db, id)
            yield* eraseSessionFile(id)
          }
          return { session: id }
        }),
    )
  })
