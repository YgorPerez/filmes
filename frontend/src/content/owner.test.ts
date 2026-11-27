// The checks every Dono server function runs before acting: a Dono, an
// admin, a slug, a note's token, and what the pages may know of her.
import { describe, expect, it } from 'vite-plus/test'
import {
  noteToken,
  ownerView,
  pathSlug,
  requireAdmin,
  requireOwner,
} from './owner'

const BRUNO = {
  name: 'Bruno',
  person: 'bruno',
  admin: false,
  email: 'bruno@example.com',
}

describe('the Dono checks', () => {
  it('refuses a call without a Dono, and an admin call without admin', () => {
    expect(() => requireOwner(null)).toThrow('Dono required')
    expect(() => requireOwner(BRUNO)).not.toThrow()
    expect(() => requireAdmin(null)).toThrow('Dono required')
    expect(() => requireAdmin(BRUNO)).toThrow('admin required')
    expect(() => requireAdmin({ ...BRUNO, admin: true })).not.toThrow()
  })

  it('takes only a non-empty slug and a note’s token', () => {
    expect(pathSlug('iara')).toBe('iara')
    expect(() => pathSlug('')).toThrow('slug required')
    expect(() => pathSlug(3)).toThrow('slug required')
    expect(noteToken('abc-123')).toBe('abc-123')
    expect(() => noteToken('a b')).toThrow('note token required')
    expect(() => noteToken(undefined)).toThrow('note token required')
  })

  it('shows the pages the Dono’s public fields, and nothing without one', () => {
    expect(ownerView({ ...BRUNO, slug: 'x' } as typeof BRUNO)).toEqual(BRUNO)
    expect(ownerView(null)).toBeNull()
  })
})
