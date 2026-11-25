// One loading step of a rebuild (Python's `banco/etapas/NN_area.py`): it
// fills the new database, after the schema, inside the rebuild's single
// transaction.

import type { Effect } from 'effect'
import type { EngineError } from '../../runtime/EngineError.ts'
import type { Environment } from '../../runtime/Environment.ts'
import type { Connection, SqliteError } from '../../sqlite/Sqlite.ts'

export interface Step {
  /** Python's module name (`20_tabelas_csv`), which fixes the order. */
  readonly name: string
  readonly load: (
    db: Connection,
  ) => Effect.Effect<void, EngineError | SqliteError, Environment>
}
