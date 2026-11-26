// A Pessoa's access (#166): an admin gives an existing Pessoa the Google
// e-mail that makes her a Dono, and takes it away; her taste stays.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'
import {
  grantAccess,
  readPeople,
  readPerson,
  revokeAccess,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'

const file = (fixture: Fixture, slug: string) =>
  join(fixture.data, 'people', `${slug}.md`)

const AS_BRUNO = { owner: 'bruno' }

describe('giving access', () => {
  test('makes the Pessoa a Dono, not admin, with the e-mail in lower case', async () => {
    const fixture = useFixture()
    const before = await fixture.ok(readPerson(file(fixture, 'quim')))

    const result = await fixture.ok(
      grantAccess({ person: 'quim', email: ' Quim@Example.org ' }),
      {},
      AS_BRUNO,
    )

    expect(result).toEqual({ person: 'quim', new: true })
    const quim = await fixture.ok(readPerson(file(fixture, 'quim')))
    expect(quim).toEqual({
      ...before,
      owner: true,
      email: 'quim@example.org',
      admin: false,
    })
  })

  test('keeps her own address, which is no clash', async () => {
    const fixture = useFixture()
    // Iara has an e-mail in the fixture but is not a Dono.
    await fixture.ok(
      grantAccess({ person: 'iara', email: 'IARA@example.org' }),
      {},
      AS_BRUNO,
    )
    expect(readFileSync(file(fixture, 'iara'), 'utf8')).toMatch(
      /owner: true\nemail: iara@example\.org\n/,
    )
  })

  test.each([
    ['', 'email_required'],
    ['quim@x', 'invalid_email'],
    ['Vera@example.org', 'email_taken'],
  ])('refuses %j: %s', async (email, reason) => {
    const fixture = useFixture()
    const outcome = await fixture.run(
      grantAccess({ person: 'quim', email }),
      {},
      AS_BRUNO,
    )
    expect(outcome).toMatchObject({
      exitCode: 2,
      output: { error: { code: 'invalid_usage', reason } },
    })
    const quim = await fixture.ok(readPerson(file(fixture, 'quim')))
    expect(quim.owner).toBe(false)
    expect(quim.email).toBeNull()
  })
})

describe('giving access', () => {
  test('refuses a Pessoa who is a Dono already', async () => {
    const fixture = useFixture()
    const outcome = await fixture.run(
      grantAccess({ person: 'vera', email: 'outra@example.org' }),
      {},
      AS_BRUNO,
    )
    expect(outcome).toMatchObject({
      exitCode: 2,
      output: { error: { reason: 'already_owner' } },
    })
    expect(readFileSync(file(fixture, 'vera'), 'utf8')).toContain(
      'email: vera@example.org',
    )
  })
})

describe('taking access away', () => {
  test('removes the e-mail and the Dono mark and keeps her taste', async () => {
    const fixture = useFixture()
    const before = await fixture.ok(readPerson(file(fixture, 'vera')))

    const result = await fixture.ok(
      revokeAccess({ person: 'vera' }),
      {},
      AS_BRUNO,
    )

    expect(result).toEqual({ person: 'vera', new: true })
    const vera = await fixture.ok(readPerson(file(fixture, 'vera')))
    expect(vera).toEqual({ ...before, owner: false, email: null, admin: false })
    const text = readFileSync(file(fixture, 'vera'), 'utf8')
    expect(text).not.toMatch(/owner:|email:/)
    // She is still a Pessoa, by name.
    expect((await fixture.ok(readPeople)).map((p) => p.slug)).toContain('vera')
  })

  test('changes nothing on a Pessoa without access', async () => {
    const fixture = useFixture()
    const before = readFileSync(file(fixture, 'quim'), 'utf8')
    const result = await fixture.ok(
      revokeAccess({ person: 'quim' }),
      {},
      AS_BRUNO,
    )
    expect(result).toEqual({ person: 'quim', new: false })
    expect(readFileSync(file(fixture, 'quim'), 'utf8')).toBe(before)
  })

  test('never takes the logged-in Dono her own', async () => {
    const fixture = useFixture()
    const outcome = await fixture.run(
      revokeAccess({ person: 'bruno' }),
      {},
      AS_BRUNO,
    )
    expect(outcome).toMatchObject({
      exitCode: 2,
      output: { error: { code: 'invalid_usage', reason: 'own_access' } },
    })
    expect(readFileSync(file(fixture, 'bruno'), 'utf8')).toContain(
      'email: bruno@example.org',
    )
  })
})
