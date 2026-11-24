import { readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'
import { keyFile } from './ssh-key.ts'

// Not a real key: only the markers `keyFile` looks for.
const KEY =
  '-----BEGIN OPENSSH PRIVATE KEY-----\nnot-a-key\n-----END OPENSSH PRIVATE KEY-----'

describe('the key ssh -i reads', () => {
  it('without a key, there is no file', () => {
    expect(keyFile(undefined)).toBeUndefined()
    expect(keyFile('')).toBeUndefined()
  })

  it('a path goes as it came', () => {
    expect(keyFile('/home/me/.ssh/filmes-deploy')).toBe(
      '/home/me/.ssh/filmes-deploy',
    )
  })

  it('a whole key goes to a file only its owner reads, with the newline ssh needs', () => {
    const file = keyFile(KEY) ?? ''

    expect(readFileSync(file, 'utf8')).toBe(`${KEY}\n`)
    expect(statSync(file).mode & 0o777).toBe(0o600)
  })
})
