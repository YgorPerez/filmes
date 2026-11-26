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
  host: 'cinema.temestudo.cloud',
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
 * Each step that sets variables replaces its own lines and keeps the rest
 * (`dataRepo`); the OAuth and source keys go here later. */
const APP_ENV = 'app.env'

/** filmes-dados on the volume (ADR 0005): the clone the app writes and
 * commits to, the deploy key that pushes it, and the hosts ssh has seen,
 * by their path on the VPS and inside the container. */
const DATA_REPO = {
  clone: 'filmes-dados',
  key: 'filmes-dados.key',
  knownHosts: 'filmes-dados.key.known_hosts',
} as const

/** A git URL that goes into a script and into `app.env` as it is: no
 * quote, no space, no `$`. */
const REMOTE = /^[A-Za-z0-9@._~:/+-]+$/

/** An OpenSSH private key, which goes into a script in a quoted
 * here-document: only its own lines. */
const PRIVATE_KEY =
  /^-----BEGIN [A-Z ]+-----\n[A-Za-z0-9+/=\n]+-----END [A-Z ]+-----\n?$/

/** The UID and GID of the `node` user in `node:24-alpine`, which the
 * container runs as: the volume is its. */
const NODE_USER = '1000:1000'

/** Goes on the `ssh` command line: only a SHA passes. */
const SHA = /^[0-9a-f]{7,40}$/

/** A database version's name, which becomes `db/<version>.sqlite` on the VPS
 * and goes into the scripts. No dot, so `<version>.sqlite-wal` and
 * `<version>.sqlite.part` belong to it unambiguously. */
const VERSION = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

/** The variable that tells the app which database version to open, as the
 * path inside the container. */
const DATABASE_ENV = 'FILMES_DATABASE'

/** Free room the VPS keeps after a database upload, in bytes: the disk is
 * shared with temestudo and saude. */
const DISK_MARGIN = 1024 ** 3

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
const OLDER_IMAGES = String.raw`{ docker images ${APP.container} --format '{{.Tag}}' | grep -vx "sha-$SHA" || true; } | tail -n +2 \
  | while read -r TAG; do docker rmi "${APP.container}:$TAG" >/dev/null || true; done`

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

/** What the app needs to push filmes-dados: the remote and the deploy
 * key's text (a GitHub deploy key with write access to that repository
 * only). */
export type DataRepo = { remote: string; key: string }

/** The deploy key in the volume, readable by the container only; the clone
 * of filmes-dados, made once, with that key; and `app.env` with
 * `FILMES_DADOS`, `FILMES_DATA_REMOTE` and `FILMES_DATA_KEY`, the rest of the file kept. The
 * key goes inside the script, which reaches the VPS through ssh's stdin,
 * never on a command line. An existing clone is left as it is: it may hold
 * commits not pushed yet. */
function dataRepo({ remote, key }: DataRepo, paths: VpsPaths) {
  const keyFile = `${paths.data}/${DATA_REPO.key}`
  const knownHosts = `${paths.data}/${DATA_REPO.knownHosts}`
  const clone = `${paths.data}/${DATA_REPO.clone}`
  const text = key.endsWith('\n') ? key : `${key}\n`
  return String.raw`( umask 077; cat > "${keyFile}.new" <<'FILMES_DATA_KEY'
${text}FILMES_DATA_KEY
)
mv -f "${keyFile}.new" "${keyFile}"
touch "${knownHosts}"
chmod 600 "${keyFile}" "${knownHosts}"
if [ ! -d "${clone}/.git" ]; then
  command -v git >/dev/null || { echo "The VPS has no git: run prepare-vps.sh again." >&2; exit 1; }
  rm -rf "${clone}.part"
  GIT_SSH_COMMAND="ssh -F /dev/null -i '${keyFile}' -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile='${knownHosts}'" \
    git clone --quiet '${remote}' "${clone}.part"
  mv "${clone}.part" "${clone}"
  chown -R ${NODE_USER} "${clone}"
  echo "filmes-dados cloned into ${clone}."
fi
chown ${NODE_USER} "${keyFile}" "${knownHosts}"
( umask 077
  { grep -v -e '^FILMES_DADOS=' -e '^FILMES_DATA_REMOTE=' -e '^FILMES_DATA_KEY=' ${APP_ENV} 2>/dev/null || true
    printf '%s\n' 'FILMES_DADOS=/data/${DATA_REPO.clone}' 'FILMES_DATA_REMOTE=${remote}' 'FILMES_DATA_KEY=/data/${DATA_REPO.key}'
  } > ${APP_ENV}.new )
mv -f ${APP_ENV}.new ${APP_ENV}
echo "The push of filmes-dados is set in ${APP_ENV}."
`
}

function checkDataRepo({ remote, key }: DataRepo) {
  if (!REMOTE.test(remote))
    throw new Error('FILMES_DATA_REMOTE is not a git URL.')
  if (!PRIVATE_KEY.test(key))
    throw new Error('FILMES_DATA_DEPLOY_KEY is not a private key.')
}

/** Which image the swap starts: a deploy's SHA, or the one already live,
 * read from `live` on the VPS. Either way it lands in `$SHA`. */
type Image = { sha: string } | 'live'

/** Which database version the new container opens, in `$DB`: the live one
 * (`db-live`, none before the first `db:publish`), a version just uploaded
 * or asked for, or the one before the live one (`db-previous`). */
type Database = 'live' | { version: string } | 'previous'

function chooseImage(image: Image) {
  if (image !== 'live') return `SHA=${image.sha}`
  return String.raw`SHA=$(cat live 2>/dev/null || true)
[ -n "$SHA" ] || { echo "No app is live on the VPS: publish the app first (vps.ts --publish)." >&2; exit 1; }`
}

function chooseDatabase(database: Database, paths: VpsPaths) {
  const pick =
    database === 'live'
      ? 'DB=$(cat db-live 2>/dev/null || true)'
      : database === 'previous'
        ? String.raw`DB=$(cat db-previous 2>/dev/null || true)
[ -n "$DB" ] || { echo "The VPS kept no previous database: give the version." >&2; exit 1; }`
        : `DB=${database.version}`
  return String.raw`${pick}
DB_ENV=()
if [ -n "$DB" ]; then
  [ -f "${paths.data}/db/$DB.sqlite" ] || { echo "The VPS does not have the database $DB." >&2; exit 1; }
  DB_ENV=(-e "${DATABASE_ENV}=/data/db/$DB.sqlite")
fi`
}

/** The swap with no downtime window. The new container starts on the pair's
 * free port, next to the old one, and Nginx only passes to it after it
 * answers. The old one stops after Nginx's old workers finish the requests
 * they had. If something fails before the reload, what was live stays live,
 * and so do `live` and `db-live`.
 *
 * Every swap passes the database version: an app deploy keeps the live one,
 * and a `db:publish` starts the live image with a new one.
 *
 * With `withConfig`, the vhost and the rotation that came in `upload/` go in
 * together with the new port, and go back to what they were if `nginx -t`
 * refuses. */
function swapApp(
  {
    image,
    database,
    withConfig,
  }: { image: Image; database: Database; withConfig: boolean },
  paths: VpsPaths,
) {
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
${chooseImage(image)}
docker image inspect "${container}:sha-$SHA" >/dev/null 2>&1 || { echo "The VPS does not have the image ${container}:sha-$SHA." >&2; exit 1; }
${chooseDatabase(database, paths)}
INCLUDE=${include}
LIVE=$(grep -o '127\.0\.0\.1:[0-9]*' "$INCLUDE" 2>/dev/null | cut -d: -f2 || true)
if [ "$LIVE" = "${ports[0]}" ]; then PORT=${ports[1]}; else PORT=${ports[0]}; fi
NEW=${container}-next
docker rm -f "$NEW" >/dev/null 2>&1 || true
ENV_FILE=()
if [ -f ${APP_ENV} ]; then ENV_FILE=(--env-file ${APP_ENV}); fi
docker run -d --name "$NEW" --restart unless-stopped --init \
  --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges \
  --log-opt max-size=10m --log-opt max-file=3 "${'$'}{ENV_FILE[@]}" "${'$'}{DB_ENV[@]}" \
  -v ${paths.data}:/data \
  -p "127.0.0.1:$PORT:3000" "${container}:sha-$SHA" >/dev/null
# With a database, the probe is /saude, which opens it: code of another
# schema than the database's says banco-desatualizado and is refused at once.
# Before the first db:publish there is none, and / is enough.
PROBE=/saude
[ -n "$DB" ] || PROBE=/
UP=0
for i in $(seq 1 30); do
  ANSWER=$(curl -s -H 'Host: ${host}' -H 'X-Forwarded-Proto: https' -w ' %{http_code}' "http://127.0.0.1:$PORT$PROBE" 2>/dev/null || true)
  case "$ANSWER" in
    *' 200') UP=1; break ;;
    banco-desatualizado*) UP=outdated; break ;;
  esac
  sleep 2
done
if [ "$UP" = outdated ]; then
  echo "The image sha-$SHA was built for another schema than the database ${'$'}{DB}; what was live stays. Build and publish its database: pnpm db:publish --build --sha $SHA." >&2
  docker rm -f "$NEW" >/dev/null
  exit 1
fi
if [ "$UP" != 1 ]; then
  echo "The new app did not answer on $PROBE at port $PORT; what was live stays. Last logs:" >&2
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
if [ -n "$LIVE_BEFORE" ] && [ "$LIVE_BEFORE" != "$SHA" ]; then echo "$LIVE_BEFORE" > previous; fi
echo "$SHA" > live
if [ -n "$DB" ]; then
  DB_BEFORE=$(cat db-live 2>/dev/null || true)
  if [ -n "$DB_BEFORE" ] && [ "$DB_BEFORE" != "$DB" ]; then echo "$DB_BEFORE" > db-previous; fi
  echo "$DB" > db-live
fi
${OLDER_IMAGES}
echo "App sha-$SHA live on port $PORT${'$'}{DB:+, with the database $DB}, for ${host}."
`
}

/** A deploy step: a script on the VPS, which the log times by name. */
export type Step = {
  name: string
  /** Before the script, what goes up from the upload folder to `upload/`. */
  upload?: readonly string[]
  /** After the script, a local file that goes to a path on the VPS, with
   * resume (the database, which is too big for `upload/` and `scp`). */
  send?: { file: string; to: string }
  script: string
}

function checkSha(sha: string) {
  if (!SHA.test(sha)) throw new Error(`"${sha}" is not a SHA.`)
}

/** Publishing a build: the upload, the image, the volume, filmes-dados
 * when its remote and key are given, and the swap, which installs the host
 * configuration along with it. The database stays the live one. */
export function publishPlan({
  sha,
  dataRepo: data,
  paths = ON_VPS,
}: {
  sha: string
  dataRepo?: DataRepo
  paths?: VpsPaths
}): Step[] {
  checkSha(sha)
  if (data) checkDataRepo(data)
  return [
    {
      name: 'Upload',
      upload: UPLOAD,
      script: 'rm -rf upload && mkdir -p upload',
    },
    { name: 'Image', script: buildImage(sha) },
    { name: 'Volume', script: ensureVolume(paths) },
    ...(data ? [{ name: 'Data repo', script: dataRepo(data, paths) }] : []),
    {
      name: 'Swap',
      script: swapApp(
        { image: { sha }, database: 'live', withConfig: true },
        paths,
      ),
    },
  ]
}

/** Rolling back to an image the VPS kept. The vhost and the database stay as
 * they are. */
export function rollbackPlan({
  sha,
  paths = ON_VPS,
}: {
  sha: string
  paths?: VpsPaths
}): Step[] {
  checkSha(sha)
  return [
    {
      name: 'Swap',
      script: swapApp(
        { image: { sha }, database: 'live', withConfig: false },
        paths,
      ),
    },
  ]
}

function checkVersion(version: string) {
  if (!VERSION.test(version))
    throw new Error(
      `"${version}" is not a database version: letters, digits, - and _, up to 64.`,
    )
}

/** Before the database goes up: the image to swap onto it is on the VPS
 * (the live one, or the SHA asked for), the version is new,
 * and the disk keeps its margin after it. A part left by an interrupted
 * upload of the same version counts as already there, and rsync resumes
 * it. */
function makeRoom(
  version: string,
  size: number,
  image: Image,
  paths: VpsPaths,
) {
  const db = `${paths.data}/db`
  return String.raw`${chooseImage(image)}
docker image inspect "${APP.container}:sha-$SHA" >/dev/null 2>&1 || { echo "The VPS does not have the image ${APP.container}:sha-$SHA: deploy it first (a deploy its database refused leaves it there)." >&2; exit 1; }
command -v rsync >/dev/null || { echo "The VPS has no rsync: run prepare-vps.sh again." >&2; exit 1; }
${ensureVolume(paths)}[ ! -e "${db}/${version}.sqlite" ] || { echo "The VPS already has the database ${version}." >&2; exit 1; }
FREE=$(df -PB1 "${db}" | awk 'NR == 2 { print $4 }')
HAVE=$(stat -c %s "${db}/${version}.sqlite.part" 2>/dev/null || echo 0)
NEED=$(( ${size} - HAVE + ${DISK_MARGIN} ))
if [ "$FREE" -lt "$NEED" ]; then
  echo "The VPS has $FREE bytes free in ${db}; the database needs $NEED, with 1 GB left for the neighbours." >&2
  exit 1
fi
echo "The database ${version} goes up to ${db}."
`
}

/** The uploaded part becomes the version, owned by the container's user,
 * which writes to it (the data loaders on start). The rename is atomic: a
 * half-uploaded file never has the version's name. */
function installDatabase(version: string, size: number, paths: VpsPaths) {
  const part = `${paths.data}/db/${version}.sqlite.part`
  return String.raw`PART="${part}"
[ "$(head -c 15 "$PART")" = "SQLite format 3" ] || { echo "The upload of ${version} is not a SQLite database; it stays in $PART." >&2; exit 1; }
[ "$(stat -c %s "$PART")" = "${size}" ] || { echo "The upload of ${version} does not have ${size} bytes; it stays in $PART." >&2; exit 1; }
chown ${NODE_USER} "$PART"
chmod 640 "$PART"
mv -f "$PART" "${paths.data}/db/${version}.sqlite"
echo "Database ${version} installed."
`
}

/** Only the live database and the previous one stay in `db/`, with their
 * `-wal` and `-shm`: everything else goes, parts of interrupted uploads
 * included. */
function olderDatabases(paths: VpsPaths) {
  return String.raw`${LOCK}
KEEP_LIVE=$(cat db-live)
KEEP_PREVIOUS=$(cat db-previous 2>/dev/null || true)
for FILE in ${paths.data}/db/*; do
  [ -e "$FILE" ] || continue
  NAME=$(basename "$FILE")
  VERSION=${'$'}{NAME%%.*}
  if [ "$VERSION" != "$KEEP_LIVE" ] && [ "$VERSION" != "$KEEP_PREVIOUS" ]; then
    rm -f "$FILE"
    echo "Deleted db/$NAME."
  fi
done
`
}

/** Publishing a database built on servidor-azul (ADR 0005): the upload to
 * `db/<version>.sqlite`, then the swap onto it, then the retention. The
 * swap starts the live image, or with `sha` that commit's (#258): when the
 * schema changes, the deploy of the new code is refused on the old database,
 * and the new database is refused by the old code, so both go live
 * together here. `auth.sqlite` and the sources' cache, beside `db/`, are not
 * touched. */
export function databasePublishPlan({
  file,
  size,
  version,
  sha,
  paths = ON_VPS,
}: {
  /** The local database file. */
  file: string
  /** Its size in bytes, checked against the upload. */
  size: number
  version: string
  /** The image that goes live with it; the live one when absent. */
  sha?: string
  paths?: VpsPaths
}): Step[] {
  checkVersion(version)
  if (sha !== undefined) checkSha(sha)
  const image: Image = sha === undefined ? 'live' : { sha }
  if (!Number.isSafeInteger(size) || size <= 0)
    throw new Error(`${size} is not a file size.`)
  return [
    {
      name: 'Upload',
      script: makeRoom(version, size, image, paths),
      send: { file, to: `${paths.data}/db/${version}.sqlite.part` },
    },
    { name: 'Install', script: installDatabase(version, size, paths) },
    {
      name: 'Swap',
      script: swapApp(
        { image, database: { version }, withConfig: false },
        paths,
      ),
    },
    { name: 'Retention', script: olderDatabases(paths) },
  ]
}

/** Rolling the live image back to a database version the VPS kept: the
 * asked one, or the previous one. */
export function databaseRollbackPlan({
  version,
  paths = ON_VPS,
}: {
  version?: string
  paths?: VpsPaths
}): Step[] {
  if (version !== undefined) checkVersion(version)
  return [
    {
      name: 'Swap',
      script: swapApp(
        {
          image: 'live',
          database: version === undefined ? 'previous' : { version },
          withConfig: false,
        },
        paths,
      ),
    },
  ]
}
