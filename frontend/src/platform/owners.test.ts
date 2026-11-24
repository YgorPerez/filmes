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

  it('skips files the engine refuses, and files not Markdown', () => {
    const owners = repo('people', {
      plain: 'no frontmatter',
      open: '---\nname: Open\n',
      list: '---\n- a\n---\n',
      // No name: the engine refuses the file, so no one gets in by it.
      ana: '---\nowner: true\nemail: ana@example.org\n---\n',
      // An unknown key: the key migration refuses it.
      teo: '---\nnome: Teo\ndono: true\nemail: teo@example.org\nidade: 9\n---\n',
      rosa: '---\nname: Rosa\nowner: true\nemail: rosa@example.org\n---\n',
      'notes.txt':
        '---\nname: Notes\nowner: true\nemail: notes@example.org\n---\n',
    })
    expect(owners.ownerByEmail('ana@example.org')).toBeNull()
    expect(owners.ownerByEmail('notes@example.org')).toBeNull()
    expect(owners.ownerByEmail('rosa@example.org')?.name).toBe('Rosa')
  })

  it('needs an email with an @, and owner: true as YAML 1.1 reads it', () => {
    const owners = repo('people', {
      ana: '---\nname: Ana\nowner: yes\nemail: ana@example.org\n---\n',
      bia: '---\nname: Bia\nowner: true\nemail: bia\n---\n',
      caio: '---\nname: Caio\nemail: caio@example.org\n---\n',
    })
    expect(owners.ownerByEmail('ana@example.org')?.person).toBe('ana')
    expect(owners.ownerByEmail('bia')).toBeNull()
    expect(owners.ownerByEmail('caio@example.org')).toBeNull()
  })

  it('finds no one when the data repo has no Pessoas folder', () => {
    const root = mkdtempSync(join(tmpdir(), 'data-'))
    expect(ownersFromDataRepo(root).ownerByEmail('a@example.org')).toBeNull()
  })
})
