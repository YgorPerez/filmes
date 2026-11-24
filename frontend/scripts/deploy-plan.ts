// The deploy plan: what goes up to the VPS, what is swapped and what is
// deleted, and in which steps (ADR 0006). Here only text is built: the bash
// scripts each step runs on the VPS. What talks to the VPS is `vps.ts`, which
// follows the plan over SSH, and `vps.test.ts` follows the same plan in a
// bash with a fake docker (`fake-vps.ts`).
//
// Modeled on pesquisa-relacionamentos (`frontend/scripts/deploy-plan.ts`
// there), without GoatCounter and the comment token.
//
// The VPS is shared: temestudo-app, saude-app and temestudo-stats live there
// too. Every name below (folder, container, ports, vhost, include, log
// format, TLS cache) is filmes' own, and no script touches anything else:
// no `default_server`, no `sites-enabled/default`, no other container's
// image.
//
// Runs on plain `node`, which reads TypeScript by itself: only syntax it
// strips.

/** The app on the VPS. */
const APP = {
  container: 'filmes-app',
  folder: '/opt/filmes',
  /** The blue/green pair. temestudo has 3011/3031 and 3051, saude 3071. */
  ports: [3091, 3092],
  host: 'cinema.finalsend.com.br',
  /** The one-line include the vhost reads the port from
   * (`../nginx/filmes.conf`). */
  include: '/etc/nginx/filmes/filmes-app.conf',
  vhost: '/etc/nginx/sites-available/filmes.conf',
} as const

/** The host configuration that comes from `../nginx/` on each deploy: the
 * name in the repository and the path on the VPS. */
export const HOST_CONFIG = [
  ['log-without-query.conf', '/etc/nginx/conf.d/filmes-log-without-query.conf'],
  ['filmes.conf', APP.vhost],
  ['tls.conf', '/etc/nginx/filmes/tls.conf'],
  ['logrotate-filmes', '/etc/logrotate.d/filmes'],
] as const

/** What goes up to `upload/` on the VPS on each publish: the `.output` in a
 * tar, the `Dockerfile` and the host configuration. */
const UPLOAD = [
  'build.tar.gz',
  'Dockerfile',
  ...HOST_CONFIG.map(([name]) => name),
] as const

/** The app's environment on the VPS, in the app folder, read by
 * `docker run --env-file` on every swap when it exists. Only root reads it.
 * Empty for the skeleton; the OAuth and source keys go here later. */
const APP_ENV = 'app.env'

/** The UID and GID of the `node` user in `node:24-alpine`, which the
 * container runs as: the volume is its. */
const NODE_USER = '1000:1000'

/** Goes on the `ssh` command line: only a SHA passes. */
const SHA = /^[0-9a-f]{7,40}$/

/** The VPS paths the scripts touch. On the VPS the root is `/`; in the test
 * it is a temporary folder, and the script is the same. */
export type VpsPaths = ReturnType<typeof vpsPaths>

export function vpsPaths(root = '') {
  const at = (path: string) => `${root}${path}`
  return {
    folder: at(APP.folder),
    /** Where the deploy's files arrive, in the app folder. */
    upload: at(`${APP.folder}/upload`),
    include: at(APP.include),
    vhost: at(APP.vhost),
    config: HOST_CONFIG.map(([name, target]) => [name, at(target)] as const),
    /** The folders the vhost and the rotation expect to find. */
    hostFolders: [
      at('/var/log/nginx/filmes'),
      at(`${APP.folder}/acme`),
      at('/etc/nginx/filmes'),
    ],
    /** The volume, mounted at `/data` in the container: the database
     * versions in `db/` (`<version>.sqlite`, from `db:publish`), and
     * `auth.sqlite` and the sources' cache beside them, outside the swap
     * (ADR 0005). */
    data: at(`${APP.folder}/data`),
    sitesEnabled: at('/etc/nginx/sites-enabled'),
    nginxPid: at('/run/nginx.pid'),
    nginxTOutput: at('/tmp/filmes-nginx-t.txt'),
  }
}

const ON_VPS = vpsPaths()

/** The start of every script on the VPS: stops at the first error, in the
 * app folder. */
export function prologue(paths: VpsPaths = ON_VPS) {
  return `set -euo pipefail\nmkdir -p ${paths.folder}\ncd ${paths.folder}\n`
}

/** The Nginx reload on the swap. The reload starts new workers, which
 * already talk to the new port, and the old ones finish the requests they
 * had. Waits for their PIDs to exit, up to 30 s, before stopping the old
 * container: stopping before gives 502. */
function reloadNginx(pid: string) {
  return `OLD=$(pgrep -P "$(cat ${pid})" || true)
systemctl reload nginx
for i in $(seq 1 300); do
  ALIVE=0
  for P in $OLD; do
    if [ -d "/proc/$P" ]; then ALIVE=1; fi
  done
  if [ "$ALIVE" = 0 ]; then break; fi
  sleep 0.1
done`
}

/** The previous image stays, to roll back to it, and the ones before it go.
 * Only `filmes-app` images. The `|| true`: on the first deploy grep finds
 * nothing and exits with 1. */
function olderImages(sha: string) {
  return String.raw`{ docker images ${APP.container} --format '{{.Tag}}' | grep -vx "sha-${sha}" || true; } | tail -n +2 \
  | while read -r TAG; do docker rmi "${APP.container}:$TAG" >/dev/null || true; done`
}

/** One deploy at a time on the VPS. */
const LOCK = String.raw`exec 9>publish.lock
flock -w 600 9 || { echo "Another deploy has been running on the VPS for 10 min." >&2; exit 1; }`

/** The image, built on the VPS from the upload. */
function buildImage(sha: string) {
  return String.raw`${LOCK}
rm -rf upload/build
mkdir -p upload/build
tar -xzf upload/build.tar.gz -C upload/build
rm -f upload/build.tar.gz
docker build -q -f upload/Dockerfile -t ${APP.container}:sha-${sha} upload/build >/dev/null
rm -rf upload/build
echo "Image ${APP.container}:sha-${sha} built."
`
}

/** The volume the container mounts, owned by its user. Creating it twice
 * changes nothing. */
function ensureVolume(paths: VpsPaths) {
  return String.raw`install -d -m 750 ${paths.data} ${paths.data}/db
chown ${NODE_USER} ${paths.data} ${paths.data}/db
echo "Volume ${paths.data} ready."
`
}

/** The swap with no downtime window. The new container starts on the pair's
 * free port, next to the old one, and Nginx only passes to it after it
 * answers. The old one stops after Nginx's old workers finish the requests
 * they had. If something fails before the reload, what was live stays live.
 *
 * With `withConfig`, the vhost and the rotation that came in `upload/` go in
 * together with the new port, and go back to what they were if `nginx -t`
 * refuses. */
function swapApp(sha: string, withConfig: boolean, paths: VpsPaths = ON_VPS) {
  const { container, ports, host } = APP
  const { include, vhost, config, sitesEnabled } = paths
  const targets = config.map(([, target]) => `"${target}"`).join(' ')
  const install = withConfig
    ? String.raw`install -d -m 755 ${paths.hostFolders.join(' ')}
for FILE in ${targets}; do
  if [ -f "$FILE" ]; then cp -a "$FILE" "$FILE.previous"; else rm -f "$FILE.previous"; fi
done
${config.map(([name, target]) => `install -o root -g root -m 644 upload/${name} "${target}"`).join('\n')}
ln -sfn "${vhost}" ${sitesEnabled}/filmes.conf
# The temporary vhost from prepare-vps.sh has already done its job.
rm -f ${sitesEnabled}/filmes-acme.conf`
    : ''
  const undo = withConfig
    ? String.raw`  for FILE in ${targets}; do
    if [ -f "$FILE.previous" ]; then mv -f "$FILE.previous" "$FILE"; else rm -f "$FILE"; fi
  done
  if [ ! -f "${vhost}" ]; then rm -f ${sitesEnabled}/filmes.conf; fi`
    : ''
  return String.raw`${LOCK}
docker image inspect ${container}:sha-${sha} >/dev/null 2>&1 || { echo "The VPS does not have the image ${container}:sha-${sha}." >&2; exit 1; }
INCLUDE=${include}
LIVE=$(grep -o '127\.0\.0\.1:[0-9]*' "$INCLUDE" 2>/dev/null | cut -d: -f2 || true)
if [ "$LIVE" = "${ports[0]}" ]; then PORT=${ports[1]}; else PORT=${ports[0]}; fi
NEW=${container}-next
docker rm -f "$NEW" >/dev/null 2>&1 || true
ENV_FILE=()
if [ -f ${APP_ENV} ]; then ENV_FILE=(--env-file ${APP_ENV}); fi
docker run -d --name "$NEW" --restart unless-stopped --init \
  --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges \
  --log-opt max-size=10m --log-opt max-file=3 "${'$'}{ENV_FILE[@]}" \
  -v ${paths.data}:/data \
  -p "127.0.0.1:$PORT:3000" ${container}:sha-${sha} >/dev/null
UP=0
for i in $(seq 1 30); do
  if curl -fs -o /dev/null -H 'Host: ${host}' -H 'X-Forwarded-Proto: https' "http://127.0.0.1:$PORT/"; then
    UP=1; break
  fi
  sleep 2
done
if [ "$UP" != 1 ]; then
  echo "The new app did not answer on / at port $PORT; what was live stays. Last logs:" >&2
  docker logs --tail 50 "$NEW" >&2
  docker rm -f "$NEW" >/dev/null
  exit 1
fi
mkdir -p "$(dirname "$INCLUDE")"
if [ -f "$INCLUDE" ]; then cp -a "$INCLUDE" "$INCLUDE.previous"; else rm -f "$INCLUDE.previous"; fi
${install}
printf 'proxy_pass http://127.0.0.1:%s;\n' "$PORT" > "$INCLUDE"
if ! nginx -t 2>${paths.nginxTOutput}; then
  cat ${paths.nginxTOutput} >&2
  if [ -f "$INCLUDE.previous" ]; then mv -f "$INCLUDE.previous" "$INCLUDE"; else rm -f "$INCLUDE"; fi
${undo}
  docker rm -f "$NEW" >/dev/null
  echo "nginx -t refused the new configuration; the old app stays live." >&2
  exit 1
fi
${reloadNginx(paths.nginxPid)}
if docker inspect ${container} >/dev/null 2>&1; then
  docker stop --timeout 30 ${container} >/dev/null || true
fi
docker rm -f ${container} >/dev/null 2>&1 || true
docker rename "$NEW" ${container}
LIVE_BEFORE=$(cat live 2>/dev/null || true)
if [ -n "$LIVE_BEFORE" ] && [ "$LIVE_BEFORE" != "${sha}" ]; then echo "$LIVE_BEFORE" > previous; fi
echo "${sha}" > live
${olderImages(sha)}
echo "App sha-${sha} live on port $PORT, for ${host}."
`
}

/** A deploy step: a script on the VPS, which the log times by name. */
export type Step = {
  name: string
  /** Before the script, what goes up from the upload folder to `upload/`. */
  upload?: readonly string[]
  script: string
}

function checkSha(sha: string) {
  if (!SHA.test(sha)) throw new Error(`"${sha}" is not a SHA.`)
}

/** Publishing a build: the upload, the image, the volume and the swap,
 * which installs the host configuration along with it. */
export function publishPlan({
  sha,
  paths = ON_VPS,
}: {
  sha: string
  paths?: VpsPaths
}): Step[] {
  checkSha(sha)
  return [
    {
      name: 'Upload',
      upload: UPLOAD,
      script: 'rm -rf upload && mkdir -p upload',
    },
    { name: 'Image', script: buildImage(sha) },
    { name: 'Volume', script: ensureVolume(paths) },
    { name: 'Swap', script: swapApp(sha, true, paths) },
  ]
}

/** Rolling back to an image the VPS kept. The vhost stays as it is. */
export function rollbackPlan({
  sha,
  paths = ON_VPS,
}: {
  sha: string
  paths?: VpsPaths
}): Step[] {
  checkSha(sha)
  return [{ name: 'Swap', script: swapApp(sha, false, paths) }]
}
