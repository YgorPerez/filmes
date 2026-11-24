import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import { ownersFromDataRepo } from './owners'

function repo(folder: string, people: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'data-'))
  mkdirSync(join(root, folder))
  for (const [slug, text] of Object.entries(people))
    writeFileSync(
      join(root, folder, slug.includes('.') ? slug : `${slug}.md`),
      text,
    )
  return ownersFromDataRepo(root)
}

describe('the Donos in filmes-dados', () => {
  it('reads the Portuguese keys before the cutover', () => {
    const owners = repo('pessoas', {
      ygor: '---\nnome: Ygor\ndono: true\nemail: Ygor@Example.org\nadmin: true\n---\n',
    })
    expect(owners.ownerByEmail(' ygor@example.ORG ')).toEqual({
      person: 'ygor',
      name: 'Ygor',
      email: 'ygor@example.org',
      admin: true,
    })
  })

  it('reads the English keys after the cutover', () => {
    const owners = repo('people', {
      ana: '---\nname: Ana\nowner: true\nemail: ana@example.org\n---\nbody\n',
    })
    expect(owners.ownerByEmail('ana@example.org')).toMatchObject({
      person: 'ana',
      name: 'Ana',
      admin: false,
    })
  })

  it('lets two Donos in, each with her own email', () => {
    const owners = repo('people', {
      ygor: '---\nname: Ygor\nowner: true\nemail: ygor@example.org\n---\n',
      ana: '---\nname: Ana\nowner: true\nemail: ana@example.org\n---\n',
    })
    expect(owners.ownerByEmail('ana@example.org')?.person).toBe('ana')
    expect(owners.ownerByEmail('ygor@example.org')?.person).toBe('ygor')
  })

  it('finds no one for an email two Donos share', () => {
    const owners = repo('people', {
      a: '---\nname: A\nowner: true\nemail: same@example.org\n---\n',
      b: '---\nname: B\nowner: true\nemail: same@example.org\n---\n',
    })
    expect(owners.ownerByEmail('same@example.org')).toBeNull()
  })

  it('skips files without frontmatter, with a broken one, or not Markdown', () => {
    const owners = repo('people', {
      plain: 'no frontmatter',
      open: '---\nname: Open\n',
      list: '---\n- a\n---\n',
      ana: '---\nowner: true\nemail: ana@example.org\n---\n',
      'notes.txt':
        '---\nname: Notes\nowner: true\nemail: notes@example.org\n---\n',
    })
    // Without a name, the slug stands for it.
    expect(owners.ownerByEmail('ana@example.org')?.name).toBe('ana')
    expect(owners.ownerByEmail('notes@example.org')).toBeNull()
  })

  it('finds no one when the data repo has no Pessoas folder', () => {
    const root = mkdtempSync(join(tmpdir(), 'data-'))
    expect(ownersFromDataRepo(root).ownerByEmail('a@example.org')).toBeNull()
  })
})
