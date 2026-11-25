// The deploy against a fake VPS (`fake-vps.ts`): the same plan that goes
// over SSH, run in a bash, with no real Docker or Nginx. The fake VPS already
// serves temestudo, as the real one does.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import { fakeFrontend, fakeVps, NEIGHBOUR_CONTAINERS } from './fake-vps.ts'
import type { DataRepo } from './deploy-plan.ts'
import { dataRepoFrom, publish, rollback, targetFrom } from './vps.ts'

const SHA_1 = 'aaaaaaa'
const SHA_2 = 'bbbbbbb'
const SHA_3 = 'ccccccc'

/** The include that tells Nginx the app's port. */
const proxyTo = (port: number) => `proxy_pass http://127.0.0.1:${port};\n`

function aVps() {
  const vps = fakeVps()
  const log: string[] = []
  const say = (line: string) => log.push(line)
  const neighbourBefore = vps.neighbour()
  return {
    ...vps,
    log,
    neighbourBefore,
    publish: (sha: string, dataRepo?: DataRepo) =>
      publish({
        output: fakeFrontend(sha),
        sha,
        dataRepo,
        vps: vps.vps,
        paths: vps.paths,
        say,
      }),
    rollback: (sha?: string) =>
      rollback({ sha, vps: vps.vps, paths: vps.paths, say }),
    /** What is live: the include's port, and the app's image and port. */
    live: () => ({
      include: vps.read(vps.paths.include),
      app: vps.container('filmes-app'),
    }),
  }
}

describe.skipIf(process.platform === 'win32')('the deploy on the VPS', () => {
  it('the first deploy starts the app on the first port, with the volume, and installs the vhost', () => {
    const vps = aVps()

    vps.publish(SHA_1)

    expect(vps.live()).toEqual({
      include: proxyTo(3091),
      app: {
        image: `filmes-app:sha-${SHA_1}`,
        port: '3091',
        volume: `${vps.paths.data}:/data`,
        running: true,
      },
    })
    expect(vps.read(vps.paths.vhost)).toBe(`filmes.conf ${SHA_1}\n`)
    const { sitesEnabled, folder, data } = vps.paths
    expect(vps.read(join(sitesEnabled, 'filmes.conf'))).not.toBeNull()
    expect(vps.read(join(folder, 'live'))).toBe(`${SHA_1}\n`)
    expect(vps.read(join(folder, 'previous'))).toBeNull()
    expect(vps.calls()).toContain(`chown 1000:1000 ${data} ${data}/db`)
  })

  it("leaves temestudo's containers, images, vhost and the default site alone", () => {
    const vps = aVps()

    vps.publish(SHA_1)
    vps.publish(SHA_2)
    vps.publish(SHA_3)
    vps.rollback()

    expect(vps.neighbour()).toEqual(vps.neighbourBefore)
    for (const [name, image, port] of NEIGHBOUR_CONTAINERS) {
      expect(vps.container(name)).toEqual({
        image,
        port,
        volume: '',
        running: true,
      })
      expect(vps.images()).toContain(image)
    }
    expect(vps.containers().sort()).toEqual([
      'filmes-app',
      'saude-app',
      'temestudo-app',
      'temestudo-stats',
    ])
  })

  it('the log says how long each step took, and the total', () => {
    const vps = aVps()

    vps.publish(SHA_1)

    const times = vps.log.filter((l) => /took|Total/.test(l))
    expect(times.map((l) => l.replace(/[\d.]+ s/, 'N s'))).toEqual([
      'Upload took N s.',
      'Image took N s.',
      'Volume took N s.',
      'Swap took N s.',
      'Total: N s.',
    ])
  })

  it('the next deploy starts on the other port, reloads Nginx and stops the old one', () => {
    const vps = aVps()
    vps.publish(SHA_1)
    vps.calls()

    vps.publish(SHA_2)

    expect(vps.live()).toMatchObject({
      include: proxyTo(3092),
      app: { image: `filmes-app:sha-${SHA_2}`, port: '3092', running: true },
    })
    expect(vps.read(join(vps.paths.folder, 'previous'))).toBe(`${SHA_1}\n`)
    const calls = vps.calls()
    const reload = calls.indexOf('systemctl reload nginx')
    const stop = calls.indexOf('docker stop --timeout 30 filmes-app')
    expect(reload).toBeGreaterThan(-1)
    // The old one only stops after Nginx already passes to the new one.
    expect(stop).toBeGreaterThan(reload)
  })

  it('the third deploy goes back to the first port and deletes the images before the previous one', () => {
    const vps = aVps()
    vps.publish(SHA_1)
    vps.publish(SHA_2)

    vps.publish(SHA_3)

    expect(vps.live().include).toBe(proxyTo(3091))
    expect(vps.images()).toEqual([
      ...NEIGHBOUR_CONTAINERS.map(([, image]) => image),
      `filmes-app:sha-${SHA_2}`,
      `filmes-app:sha-${SHA_3}`,
    ])
  })

  it('rolling back without a SHA swaps to the previous deploy, without touching the vhost', () => {
    const vps = aVps()
    vps.publish(SHA_1)
    vps.publish(SHA_2)

    vps.rollback()

    expect(vps.live()).toMatchObject({
      include: proxyTo(3091),
      app: { image: `filmes-app:sha-${SHA_1}`, port: '3091', running: true },
    })
    expect(vps.read(vps.paths.vhost)).toBe(`filmes.conf ${SHA_2}\n`)
    expect(vps.read(join(vps.paths.folder, 'previous'))).toBe(`${SHA_2}\n`)
    expect(vps.log).toContain(`Rolling back to sha-${SHA_1}.`)
  })

  it('rolling back to a SHA the VPS did not keep leaves what is live alone', () => {
    const vps = aVps()
    vps.publish(SHA_1)
    const before = vps.live()

    expect(() => vps.rollback('deadbee')).toThrow(
      'The VPS does not have the image filmes-app:sha-deadbee.',
    )
    expect(vps.live()).toEqual(before)
  })

  it('rolling back with no previous deploy asks for the SHA', () => {
    const vps = aVps()
    vps.publish(SHA_1)

    expect(() => vps.rollback()).toThrow('give the SHA')
  })

  it('a SHA that could break out of the script stops the deploy before the VPS', () => {
    const vps = aVps()

    expect(() => vps.publish('abc; rm -rf /')).toThrow('is not a SHA')
    expect(vps.calls()).toEqual([])
  })

  it('a new container that does not answer goes, and the old one stays live', () => {
    const vps = aVps()
    vps.publish(SHA_1)
    const before = vps.live()
    vps.calls()
    vps.breakWith('app-does-not-answer')

    expect(() => vps.publish(SHA_2)).toThrow(
      /The new app did not answer on \/ at port 3092.*the log of filmes-app-next/s,
    )
    expect(vps.live()).toEqual(before)
    expect(vps.containers()).not.toContain('filmes-app-next')
    expect(vps.calls()).not.toContain('systemctl reload nginx')
    expect(vps.read(vps.paths.vhost)).toBe(`filmes.conf ${SHA_1}\n`)
  })

  it('an nginx -t that refuses undoes the new configuration, and the old one stays live', () => {
    const vps = aVps()
    vps.publish(SHA_1)
    const before = vps.live()
    vps.calls()
    vps.breakWith('nginx-refuses')

    expect(() => vps.publish(SHA_2)).toThrow(
      /unknown directive.*nginx -t refused the new configuration/s,
    )
    expect(vps.live()).toEqual(before)
    expect(vps.containers()).not.toContain('filmes-app-next')
    expect(vps.calls()).not.toContain('systemctl reload nginx')
    for (const [name, target] of vps.paths.config)
      expect(vps.read(target)).toBe(`${name} ${SHA_1}\n`)
  })

  it('an nginx -t that refuses the first deploy leaves no filmes vhost at all', () => {
    const vps = aVps()
    vps.breakWith('nginx-refuses')

    expect(() => vps.publish(SHA_1)).toThrow(/nginx -t refused/)
    expect(vps.live()).toEqual({ include: null, app: null })
    for (const [, target] of vps.paths.config)
      expect(vps.read(target)).toBeNull()
    expect(vps.read(join(vps.paths.sitesEnabled, 'filmes.conf'))).toBeNull()
    expect(vps.neighbour()).toEqual(vps.neighbourBefore)
  })
})

/** A fake deploy key: the shape of one, no real key. */
const KEY =
  '-----BEGIN OPENSSH PRIVATE KEY-----\nZmFrZQ==\n-----END OPENSSH PRIVATE KEY-----\n'

/** A bare repository standing for filmes-dados' remote, with one commit. */
function aDataRemote() {
  const root = mkdtempSync(join(tmpdir(), 'data-remote-'))
  const remote = join(root, 'filmes-dados.git')
  const env: Record<string, string | undefined> = {}
  for (const [name, value] of Object.entries(process.env))
    if (!name.startsWith('GIT_')) env[name] = value
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, {
      cwd,
      env: {
        ...env,
        GIT_AUTHOR_NAME: 'Setup',
        GIT_AUTHOR_EMAIL: 'setup@example.org',
        GIT_COMMITTER_NAME: 'Setup',
        GIT_COMMITTER_EMAIL: 'setup@example.org',
      },
    })
  git(root, 'init', '--quiet', '--bare', '-b', 'master', remote)
  const work = join(root, 'work')
  git(root, 'init', '--quiet', '-b', 'master', work)
  git(work, 'commit', '--quiet', '--allow-empty', '-m', 'initial')
  git(work, 'push', '--quiet', remote, 'master')
  return remote
}

describe.skipIf(process.platform === 'win32')('filmes-dados on the VPS', () => {
  it('writes the key for the container only, clones once and sets app.env', () => {
    const vps = aVps()
    const remote = aDataRemote()
    const { data, folder } = vps.paths

    vps.publish(SHA_1, { remote, key: KEY })

    expect(vps.read(join(data, 'filmes-dados.key'))).toBe(KEY)
    expect(statSync(join(data, 'filmes-dados.key')).mode & 0o777).toBe(0o600)
    expect(vps.read(join(data, 'filmes-dados', '.git', 'HEAD'))).not.toBeNull()
    expect(vps.read(join(folder, 'app.env'))).toBe(
      `FILMES_DADOS=/data/filmes-dados\nFILMES_DATA_REMOTE=${remote}\nFILMES_DATA_KEY=/data/filmes-dados.key\n`,
    )
    expect(vps.calls()).toContain(`chown -R 1000:1000 ${data}/filmes-dados`)
  })

  it('keeps the clone and the other lines of app.env on the next deploy', () => {
    const vps = aVps()
    const remote = aDataRemote()
    const { data, folder } = vps.paths
    vps.publish(SHA_1, { remote, key: KEY })
    vps.vps.run(
      `echo pending > ${data}/filmes-dados/unpushed.md\necho OTHER=1 >> app.env\n`,
    )

    vps.publish(SHA_2, { remote, key: KEY })
    vps.publish(SHA_3)

    expect(vps.read(join(data, 'filmes-dados', 'unpushed.md'))).toBe(
      'pending\n',
    )
    expect(vps.read(join(folder, 'app.env'))).toBe(
      `OTHER=1\nFILMES_DADOS=/data/filmes-dados\nFILMES_DATA_REMOTE=${remote}\nFILMES_DATA_KEY=/data/filmes-dados.key\n`,
    )
  })

  it('refuses a remote or a key that would break the script, without showing it', () => {
    const vps = aVps()

    expect(() =>
      vps.publish(SHA_1, { remote: "x'; rm -rf /", key: KEY }),
    ).toThrow('FILMES_DATA_REMOTE is not a git URL.')
    expect(() =>
      vps.publish(SHA_1, {
        remote: 'git@github.com:o/r.git',
        key: 'x\nFILMES_DATA_KEY\n',
      }),
    ).toThrow('FILMES_DATA_DEPLOY_KEY is not a private key.')
  })
})

describe('filmes-dados from the environment', () => {
  it('both or neither, and the message names the variable only', () => {
    expect(dataRepoFrom({})).toBeUndefined()
    expect(
      dataRepoFrom({ FILMES_DATA_REMOTE: '', FILMES_DATA_DEPLOY_KEY: '' }),
    ).toBeUndefined()
    expect(dataRepoFrom({ FILMES_DATA_DEPLOY_KEY: KEY })).toBe(
      'FILMES_DATA_REMOTE is missing (FILMES_DATA_DEPLOY_KEY is set).',
    )
    expect(dataRepoFrom({ FILMES_DATA_REMOTE: 'r' })).toBe(
      'FILMES_DATA_DEPLOY_KEY is missing (FILMES_DATA_REMOTE is set).',
    )
    expect(
      dataRepoFrom({
        FILMES_DATA_REMOTE: 'git@github.com:o/r.git',
        FILMES_DATA_DEPLOY_KEY: KEY.replaceAll('\n', '\r\n'),
      }),
    ).toEqual({ remote: 'git@github.com:o/r.git', key: KEY })
  })
})

describe('the VPS from the environment', () => {
  it('defaults to root on port 22', () => {
    expect(targetFrom({ VPS_HOST: '203.0.113.7' })).toEqual({
      host: '203.0.113.7',
      user: 'root',
      port: '22',
      key: undefined,
    })
  })

  it('an empty user or port, as an unset GitHub secret arrives, also defaults', () => {
    expect(
      targetFrom({ VPS_HOST: '203.0.113.7', VPS_USER: '', VPS_PORT: '' }),
    ).toEqual({ host: '203.0.113.7', user: 'root', port: '22', key: undefined })
  })

  it('names the variable that is wrong, never its value', () => {
    expect(targetFrom({})).toBe('VPS_HOST is missing.')
    expect(targetFrom({ VPS_HOST: 'a b' })).toBe('VPS_HOST is not a host name.')
    expect(targetFrom({ VPS_HOST: 'h', VPS_USER: 'r;t' })).toBe(
      'VPS_USER is not a user name.',
    )
    expect(targetFrom({ VPS_HOST: 'h', VPS_PORT: '2x' })).toBe(
      'VPS_PORT is not a port.',
    )
  })
})
