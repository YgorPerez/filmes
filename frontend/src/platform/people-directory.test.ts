import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import { peopleFromDataRepo } from './people-directory'

describe('any Pessoa in filmes-dados, for Trakt (#295)', () => {
  const people = () => {
    const root = mkdtempSync(join(tmpdir(), 'data-'))
    mkdirSync(join(root, 'people'))
    for (const [slug, text] of Object.entries({
      ana: '---\nname: Ana\nowner: true\nemail: ana@example.org\n---\n',
      caio: '---\nname: Caio\nemail: Caio@example.org\n---\n',
      a: '---\nname: A\nemail: same@example.org\n---\n',
      b: '---\nname: B\nemail: same@example.org\n---\n',
      dora: '---\nname: Dora\n---\n',
    }))
      writeFileSync(join(root, 'people', `${slug}.md`), text)
    writeFileSync(
      join(root, 'segredo.md'),
      '---\nname: X\nemail: x@example.org\n---\n',
    )
    return peopleFromDataRepo(root)
  }

  it('finds a Pessoa who is not Dono by her email, but never makes her Dono', () => {
    expect(people().byEmail('caio@example.org')).toEqual({
      person: 'caio',
      name: 'Caio',
      email: 'caio@example.org',
      admin: false,
    })
    expect(people().byEmail('caio@example.org', true)).toBeNull()
  })

  it('finds a Pessoa by her slug only when her email is hers alone', () => {
    expect(people().bySlug('caio')).toMatchObject({
      person: 'caio',
      email: 'caio@example.org',
    })
    expect(people().bySlug('a')).toBeNull()
    expect(people().bySlug('dora')).toBeNull()
    expect(people().bySlug('ninguem')).toBeNull()
  })

  it('reads no file outside people/', () => {
    expect(people().bySlug('../segredo')).toBeNull()
    expect(people().bySlug('')).toBeNull()
  })
})
