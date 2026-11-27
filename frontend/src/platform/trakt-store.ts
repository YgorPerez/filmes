import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { openAuthDatabase, tokenHash } from './auth-database'

export interface TraktTokens {
  readonly access: string
  readonly refresh: string
  readonly expiresAt: number
}

export interface TraktIdentity {
  readonly person: string
  readonly email: string
}

interface Attempt extends TraktIdentity {
  readonly sessionHash: string
  readonly state: string
}

const aad = ({ person, email }: TraktIdentity) =>
  Buffer.from(JSON.stringify([person, email]))

/** OAuth material stays in the VPS's auth database. The environment key is
 * separate from the database, and the ciphertext is bound to its Pessoa. */
export class TraktStore {
  constructor(
    private readonly database: string,
    private readonly key: Buffer,
  ) {}

  begin(identity: Attempt, verifier: string, now: number) {
    using db = openAuthDatabase(this.database)
    db.prepare('DELETE FROM trakt_attempts WHERE expires_at <= ?').run(now)
    db.prepare(
      'INSERT OR REPLACE INTO trakt_attempts (person, state_hash, session_hash, verifier, expires_at) VALUES (?, ?, ?, ?, ?)',
    ).run(
      identity.person,
      tokenHash(identity.state),
      identity.sessionHash,
      verifier,
      now + 600_000,
    )
  }

  claim({ person, state, sessionHash }: Attempt, now: number) {
    using db = openAuthDatabase(this.database)
    const row = db
      .prepare(
        `UPDATE trakt_attempts SET claimed = 1
       WHERE person = ? AND state_hash = ? AND session_hash = ? AND expires_at > ? AND claimed = 0
       RETURNING verifier`,
      )
      .get(person, tokenHash(state), sessionHash, now)
    return typeof row?.verifier === 'string' ? row.verifier : null
  }

  finish(identity: Attempt, tokens: TraktTokens, now: number) {
    using db = openAuthDatabase(this.database)
    // A disconnect, logout, newer attempt or expired login invalidates the
    // claimed state even while Trakt is exchanging the code.
    const result = db
      .prepare(
        `INSERT INTO trakt_grants (person, identity_hash, tokens, expires_at)
       SELECT a.person, ?, ?, ? FROM trakt_attempts a
       JOIN web_sessions w ON w.token_hash = a.session_hash
       WHERE a.person = ? AND a.state_hash = ? AND a.claimed = 1 AND a.expires_at > ? AND w.expires_at > ?
       ON CONFLICT(person) DO UPDATE SET identity_hash = excluded.identity_hash,
         tokens = excluded.tokens, expires_at = excluded.expires_at, refresh_until = 0`,
      )
      .run(
        tokenHash(identity.email),
        this.seal(identity, tokens),
        tokens.expiresAt,
        identity.person,
        tokenHash(identity.state),
        now,
        now,
      )
    return result.changes === 1
  }

  forget({ person, state }: Attempt) {
    using db = openAuthDatabase(this.database)
    db.prepare(
      'DELETE FROM trakt_attempts WHERE person = ? AND state_hash = ?',
    ).run(person, tokenHash(state))
  }

  disconnect({ person, email }: TraktIdentity) {
    using db = openAuthDatabase(this.database)
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('DELETE FROM trakt_attempts WHERE person = ?').run(person)
      db.prepare(
        'DELETE FROM trakt_grants WHERE person = ? AND identity_hash = ?',
      ).run(person, tokenHash(email))
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  connected({ person, email }: TraktIdentity) {
    using db = openAuthDatabase(this.database)
    return (
      db
        .prepare(
          'SELECT 1 FROM trakt_grants WHERE person = ? AND identity_hash = ?',
        )
        .get(person, tokenHash(email)) !== undefined
    )
  }

  async access(
    identity: TraktIdentity,
    now: number,
    refresh: (token: string) => Promise<TraktTokens>,
  ) {
    const { person, email } = identity
    const identityHash = tokenHash(email)
    using db = openAuthDatabase(this.database)
    const row = db
      .prepare(
        'SELECT tokens, expires_at FROM trakt_grants WHERE person = ? AND identity_hash = ?',
      )
      .get(person, identityHash)
    if (row === undefined) return null
    if (
      !(row.tokens instanceof Uint8Array) ||
      typeof row.expires_at !== 'number'
    )
      throw new Error('Invalid Trakt grant')
    const tokens = this.unseal(identity, Buffer.from(row.tokens))
    if (row.expires_at > now + 30_000) return tokens.access

    // Refresh tokens are single-use, including across the blue/green
    // processes that share auth.sqlite. Claim with a bounded lease.
    const lease = now + 30_000
    const claimed = db
      .prepare(
        'UPDATE trakt_grants SET refresh_until = ? WHERE person = ? AND tokens = ? AND refresh_until <= ?',
      )
      .run(lease, person, row.tokens, now)
    if (claimed.changes !== 1) throw new Error('Trakt grant has changed')
    try {
      const renewed = await refresh(tokens.refresh)
      const saved = db
        .prepare(
          'UPDATE trakt_grants SET tokens = ?, expires_at = ?, refresh_until = 0 WHERE person = ? AND tokens = ? AND refresh_until = ?',
        )
        .run(
          this.seal(identity, renewed),
          renewed.expiresAt,
          person,
          row.tokens,
          lease,
        )
      return saved.changes === 1 ? renewed.access : null
    } finally {
      db.prepare(
        'UPDATE trakt_grants SET refresh_until = 0 WHERE person = ? AND tokens = ? AND refresh_until = ?',
      ).run(person, row.tokens, lease)
    }
  }

  private seal(identity: TraktIdentity, tokens: TraktTokens) {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    cipher.setAAD(aad(identity))
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(tokens)),
      cipher.final(),
    ])
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted])
  }

  private unseal(identity: TraktIdentity, sealed: Buffer): TraktTokens {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      sealed.subarray(0, 12),
    )
    decipher.setAAD(aad(identity))
    decipher.setAuthTag(sealed.subarray(12, 28))
    const decrypted = Buffer.concat([
      decipher.update(sealed.subarray(28)),
      decipher.final(),
    ])
    return JSON.parse(decrypted.toString('utf8')) as TraktTokens
  }
}
