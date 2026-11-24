import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

// `auth.sqlite`: web sessions and Google login attempts now, the MCP OAuth
// clients, codes and tokens with #120 (ADR 0005: no backup, losing it only
// forces a new login). Append migrations here and never edit an applied one;
// during blue/green both images open the same file, so a change must be
// additive while the previous image can still run.
const migrations: readonly string[] = [
  // `email` and not the Pessoa: the Dono gate runs again on every request
  // (`auth.ts`), so a Pessoa who stops being Dono is out at once.
  `CREATE TABLE web_sessions (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL,
    expires_at INTEGER NOT NULL) STRICT;
  CREATE TABLE google_attempts (state_hash TEXT PRIMARY KEY,
    browser_hash TEXT NOT NULL, verifier TEXT NOT NULL, purpose TEXT NOT NULL,
    payload TEXT NOT NULL, expires_at INTEGER NOT NULL) STRICT;`,
]

export const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('base64url')

/** The caller owns and closes the connection. Nothing opens at import. */
export function openAuthDatabase(
  path: string,
  changes: readonly string[] = migrations,
) {
  const db = new DatabaseSync(path)
  try {
    db.exec('PRAGMA busy_timeout = 10000; PRAGMA journal_mode = WAL;')
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(
        'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL) STRICT',
      )
      for (const [index, sql] of changes.entries()) {
        const version = index + 1
        const checksum = tokenHash(sql)
        const applied = db
          .prepare('SELECT checksum FROM schema_migrations WHERE version = ?')
          .get(version)
        if (applied && applied.checksum !== checksum)
          throw new Error(`Migration ${version} changed after being applied.`)
        if (!applied) {
          db.exec(sql)
          db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(
            version,
            checksum,
          )
        }
      }
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    return db
  } catch (error) {
    db.close()
    throw error
  }
}
