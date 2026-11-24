// A fake VPS for `vps.test.ts`, modeled on pesquisa-relacionamentos
// (`fake-docker.ts` there): the plan's scripts run in a real bash, in a
// temporary folder that plays `/`, and the `docker`, `curl`, `nginx`,
// `systemctl`, `pgrep`, `chown` and `sleep` on the `PATH` are fake. The
// `docker` remembers, in files, the images and the containers (the image,
// the port, the volume, whether they stopped and their `--env-file`). Each
// call goes to `calls`, in order.
//
// The VPS is not empty: like the real one, it already serves temestudo, with
// its container, its image, its vhost and the package's default site, so the
// tests can show the deploy leaves them alone.

import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HOST_CONFIG, vpsPaths, prologue } from './deploy-plan.ts'
import type { Vps } from './vps.ts'

const DOCKER = String.raw`#!/usr/bin/env bash
E="$STATE"; C="$E/c"
echo "docker $*" >> "$E/calls"
LAST="${'$'}{!#}"
case "$1" in
  image) grep -qxF "$3" "$E/images" ;;
  images)
    # From newest to oldest, like docker.
    awk '{ l[NR] = $0 } END { for (i = NR; i > 0; i--) print l[i] }' "$E/images" | while IFS=: read -r REPO TAG; do
      if [ "$REPO" = "$2" ]; then echo "$TAG"; fi
    done ;;
  rmi)
    grep -vxF "$2" "$E/images" > "$E/images.new" || true
    mv "$E/images.new" "$E/images" ;;
  build)
    while [ $# -gt 0 ]; do
      if [ "$1" = -t ]; then echo "$2" >> "$E/images"; fi
      shift
    done ;;
  run)
    shift; NAME=; PORT=; IMAGE=; ENV_FILE=; VOLUME=
    while [ $# -gt 0 ]; do
      case "$1" in
        --name) NAME=$2; shift 2 ;;
        -p) PORT=$(echo "$2" | cut -d: -f2); shift 2 ;;
        --env-file) ENV_FILE=$2; shift 2 ;;
        -v) VOLUME=$2; shift 2 ;;
        --restart|--tmpfs|--cap-drop|--security-opt|--log-opt) shift 2 ;;
        -*) shift ;;
        *) IMAGE=$1; break ;;
      esac
    done
    grep -qxF "$IMAGE" "$E/images" || { echo "Unable to find image $IMAGE" >&2; exit 125; }
    [ ! -f "$C/$NAME" ] || { echo "Conflict: $NAME already exists" >&2; exit 125; }
    echo "$IMAGE" > "$C/$NAME"; echo "$PORT" > "$C/$NAME.port"; echo "$VOLUME" > "$C/$NAME.volume"
    if [ -n "$ENV_FILE" ]; then cp "$ENV_FILE" "$C/$NAME.env"; fi ;;
  rm)
    [ -f "$C/$LAST" ] || { echo "No such container: $LAST" >&2; exit 1; }
    rm -f "$C/$LAST" "$C/$LAST.port" "$C/$LAST.volume" "$C/$LAST.stopped" "$C/$LAST.env" ;;
  stop) [ -f "$C/$LAST" ] && touch "$C/$LAST.stopped" ;;
  rename)
    for EXT in "" .port .volume .stopped .env; do
      if [ -f "$C/$2$EXT" ]; then mv "$C/$2$EXT" "$C/$3$EXT"; fi
    done ;;
  logs) echo "the log of $LAST" ;;
  inspect) [ -f "$C/$LAST" ] ;;
esac
`

/** The app's `curl` passes if some answering container is on the requested
 * port. */
const CURL = String.raw`#!/usr/bin/env bash
echo "curl $*" >> "$STATE/calls"
PORT=$(echo "${'$'}{!#}" | sed -E 's|.*:([0-9]+)/.*|\1|')
[ ! -f "$STATE/app-does-not-answer" ] || exit 7
for P in "$STATE"/c/*.port; do
  if [ -f "$P" ] && [ "$(cat "$P")" = "$PORT" ]; then exit 0; fi
done
exit 7
`

const NGINX = String.raw`#!/usr/bin/env bash
echo "nginx $*" >> "$STATE/calls"
if [ -f "$STATE/nginx-refuses" ]; then
  echo "nginx: [emerg] unknown directive \"proxy_pas\"" >&2; exit 1
fi
`

/** Only records the call and exits fine. */
const RECORD = String.raw`#!/usr/bin/env bash
echo "$(basename "$0") $*" >> "$STATE/calls"
`

/** `install -o root -g root` for a non-root user: drops the owner and
 * installs. */
const INSTALL = String.raw`#!/usr/bin/env bash
ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    -o|-g) shift 2 ;;
    *) ARGS+=("$1"); shift ;;
  esac
done
exec /usr/bin/install "${'$'}{ARGS[@]}"
`

/** What the VPS has, or comes to have, before the next script. */
type Fault = 'app-does-not-answer' | 'nginx-refuses'

/** What temestudo already has on the VPS: a path from the root and its
 * content. */
const NEIGHBOUR_FILES = [
  ['etc/nginx/sites-available/temestudo.conf', 'temestudo vhost\n'],
  ['etc/nginx/sites-enabled/temestudo.conf', 'temestudo vhost\n'],
  ['etc/nginx/sites-enabled/default', 'default site\n'],
  ['etc/nginx/conf.d/temestudo-log-sem-query.conf', 'temestudo log\n'],
  ['etc/nginx/temestudo/temestudo-app.conf', 'proxy_pass 3031\n'],
  ['etc/logrotate.d/temestudo', 'temestudo rotation\n'],
  ['opt/temestudo/no-ar', 'temestudo sha\n'],
] as const

/** A VPS with Nginx up, temestudo live and nothing of filmes. */
export function fakeVps() {
  const root = mkdtempSync(join(tmpdir(), 'fake-vps-'))
  const state = join(root, 'docker')
  const bin = join(root, 'bin')
  const paths = vpsPaths(root)
  // The folders Ubuntu's Nginx and logrotate already bring.
  const fromSystem = [
    'etc/nginx/conf.d',
    'etc/nginx/sites-available',
    'etc/logrotate.d',
    'etc/nginx/temestudo',
    'opt/temestudo',
    'run',
    'tmp',
  ]
  for (const folder of [
    join(state, 'c'),
    bin,
    paths.sitesEnabled,
    ...fromSystem.map((p) => join(root, p)),
  ])
    mkdirSync(folder, { recursive: true })
  for (const [path, text] of NEIGHBOUR_FILES)
    writeFileSync(join(root, path), text)
  writeFileSync(join(state, 'images'), 'temestudo-app:sha-2c1f1d9\n')
  writeFileSync(
    join(state, 'c', 'temestudo-app'),
    'temestudo-app:sha-2c1f1d9\n',
  )
  writeFileSync(join(state, 'c', 'temestudo-app.port'), '3031\n')
  writeFileSync(join(state, 'calls'), '')
  writeFileSync(paths.nginxPid, '1\n')
  const programs = {
    docker: DOCKER,
    curl: CURL,
    nginx: NGINX,
    systemctl: RECORD,
    chown: RECORD,
    pgrep: '#!/usr/bin/env bash\nexit 1\n',
    sleep: '#!/usr/bin/env bash\n',
    install: INSTALL,
  }
  for (const [name, text] of Object.entries(programs)) {
    writeFileSync(join(bin, name), text)
    chmodSync(join(bin, name), 0o755)
  }

  const vps: Vps = {
    run(script) {
      const r = spawnSync('bash', ['-s'], {
        cwd: root,
        input: `${prologue(paths)}${script}`,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          STATE: state,
        },
      })
      if (r.status !== 0)
        throw new Error(
          `the script exited with ${r.status}: ${r.stderr.trim()}`,
        )
      return r.stdout
    },
    upload(folder, names) {
      for (const name of names)
        copyFileSync(join(folder, name), join(paths.folder, 'upload', name))
    },
  }

  const read = (path: string) =>
    existsSync(path) ? readFileSync(path, 'utf8') : null
  const container = (name: string) => {
    const base = join(state, 'c', name)
    if (!existsSync(base)) return null
    return {
      image: readFileSync(base, 'utf8').trim(),
      port: readFileSync(`${base}.port`, 'utf8').trim(),
      volume: read(`${base}.volume`)?.trim() ?? '',
      running: !existsSync(`${base}.stopped`),
    }
  }

  return {
    vps,
    paths,
    read,
    container,
    /** temestudo's files, by path from the root, with what they hold now. */
    neighbour: () =>
      Object.fromEntries(
        NEIGHBOUR_FILES.map(([path]) => [path, read(join(root, path))]),
      ),
    containers: () =>
      readdirSync(join(state, 'c')).filter((n) => !n.includes('.')),
    images: () =>
      readFileSync(join(state, 'images'), 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean),
    /** The calls to the fake programs since the last time they were read. */
    calls() {
      const file = join(state, 'calls')
      const lines = readFileSync(file, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
      writeFileSync(file, '')
      return lines
    },
    breakWith(fault: Fault) {
      writeFileSync(join(state, fault), '')
    },
  }
}

/** A `frontend/` with an `.output`, the `Dockerfile` and `nginx/`, as
 * `publish` expects. The version goes inside each configuration file. */
export function fakeFrontend(version: string) {
  const frontend = mkdtempSync(join(tmpdir(), 'fake-frontend-'))
  mkdirSync(join(frontend, '.output', 'server'), { recursive: true })
  writeFileSync(join(frontend, '.output', 'server', 'index.mjs'), version)
  writeFileSync(join(frontend, 'Dockerfile'), 'FROM node:24-alpine\n')
  mkdirSync(join(frontend, 'nginx'))
  for (const [name] of HOST_CONFIG)
    writeFileSync(join(frontend, 'nginx', name), `${name} ${version}\n`)
  return join(frontend, '.output')
}
