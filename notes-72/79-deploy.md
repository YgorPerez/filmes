# #79 deploy: what other tickets can rely on

Branch `ticket/79-deploy`. ADR 0006.

- Live: https://cinema.finalsend.com.br serves `frontend/` from container `filmes-app` on the temestudo VPS, ports 3091/3092 (blue/green), first deployed by hand from this machine at `80045fb`.
- Files: `frontend/scripts/{deploy-plan,vps,check-live,ssh-key,stopwatch,fake-vps}.ts`, `prepare-vps.sh`, `deploy-wizard.sh`; `frontend/nginx/{filmes.conf,tls.conf,log-without-query.conf,logrotate-filmes}`; `frontend/Dockerfile` (copies `.output` only, runs as `node`, UID 1000); `.github/workflows/deploy.yml` (push to `master`, paths frontend/packages/lockfile).
- Volume: `/opt/filmes/data` on the host, mounted at `/data` in the container, owned by 1000:1000, mode 750. `db/` is for `<version>.sqlite` (db:publish). Put `auth.sqlite` and the sources' cache directly in `/data`. The container is `--read-only` with `/tmp` as tmpfs: anything else written outside `/data` fails.
- Env for the app: `/opt/filmes/app.env` (root only) is passed with `--env-file` on every swap when present. Nothing writes it yet; a ticket that needs Google OAuth or source keys should add a plan step like pesquisa-relacionamentos' `writeAppEnv` (secret via ssh stdin, never argv).
- To pass a DB version to the container, add `-e`/env in `swapApp` (deploy-plan.ts); the blue/green DB swap of db:publish is not built.
- Request log: `frontend/src/server.ts` wraps the handler with `withRequestLog` (`src/platform/request-log.ts`): `GET /path 200 12ms`, no query.
- Repo secrets set: `VPS_HOST`, `VPS_USER`, `VPS_PORT`, `VPS_SSH_KEY` (a dedicated `filmes-deploy` key, in root's authorized_keys on the VPS; private key at `~/.ssh/filmes-deploy` on Ygor's machine).
- Manual deploy from the machine: `cd frontend && pnpm build && VPS_HOST=… VPS_SSH_KEY=~/.ssh/filmes-deploy node scripts/vps.ts --publish .output $(git rev-parse HEAD)`, then `node scripts/check-live.ts cinema.finalsend.com.br <sha>`.
- Frontend coverage floor is now 82/74/77/85 (scripts are counted).
