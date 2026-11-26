import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

// `auth.sqlite`: web sessions, Google login attempts, the MCP OAuth clients,
// codes and tokens (#120), and the Session link signing key (#180). Losing the
// database forces a new login and invalidates links already shared (ADR 0005).
// Append migrations here and never edit an applied one. Both images open the
// same file during a deploy, so changes must be additive.
const migrations: readonly string[] = [
  // `email` and not the Pessoa: the Dono gate runs again on every request
  // (`auth.ts`), so a Pessoa who stops being Dono is out at once.
  `CREATE TABLE web_sessions (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL,
    expires_at INTEGER NOT NULL) STRICT;
  CREATE TABLE google_attempts (state_hash TEXT PRIMARY KEY,
    browser_hash TEXT NOT NULL, verifier TEXT NOT NULL, purpose TEXT NOT NULL,
    payload TEXT NOT NULL, expires_at INTEGER NOT NULL) STRICT;`,
  // The MCP connector's OAuth (#120, `oauth-server.ts`). Clients come from
  // dynamic registration and are public (no secret). A grant is one
  // connection of one client for one email; its codes and tokens are stored
  // by their hash and go when the grant goes. `email`, as in `web_sessions`:
  // the Dono gate runs again on every token use.
  `CREATE TABLE oauth_clients (client_id TEXT PRIMARY KEY, name TEXT NOT NULL,
    redirect_uris TEXT NOT NULL, created_at INTEGER NOT NULL) STRICT;
  CREATE TABLE oauth_codes (code_hash TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES oauth_clients ON DELETE CASCADE,
    redirect_uri TEXT NOT NULL, code_challenge TEXT NOT NULL,
    scope TEXT NOT NULL, resource TEXT NOT NULL, email TEXT NOT NULL,
    expires_at INTEGER NOT NULL) STRICT;
  CREATE TABLE oauth_grants (grant_id TEXT PRIMARY KEY,
    client_id TEXT NOT NULL REFERENCES oauth_clients ON DELETE CASCADE,
    email TEXT NOT NULL, scope TEXT NOT NULL, resource TEXT NOT NULL,
    created_at INTEGER NOT NULL) STRICT;
  CREATE TABLE oauth_tokens (token_hash TEXT PRIMARY KEY,
    grant_id TEXT NOT NULL REFERENCES oauth_grants ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('access', 'refresh')),
    expires_at INTEGER NOT NULL) STRICT;
  CREATE INDEX oauth_tokens_grant ON oauth_tokens (grant_id);`,
  // Stable signing key shared by both images. A Session link expires
  // against the live Session file, independently of this database.
  `CREATE TABLE session_link_key (id INTEGER PRIMARY KEY CHECK (id = 1),
    secret BLOB NOT NULL CHECK (length(secret) = 32)) STRICT;`,
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
    db.exec(
      'PRAGMA busy_timeout = 10000; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;',
    )
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
