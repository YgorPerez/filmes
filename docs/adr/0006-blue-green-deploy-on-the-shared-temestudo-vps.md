# Blue/green deploy on the shared temestudo VPS

filmes goes online at `cinema.finalsend.com.br` on the VPS that already serves temestudo.cloud (temestudo-app, temestudo-stats) and saude.temestudo.cloud (saude-app), a Hostinger KVM 1. The deploy is pesquisa-relacionamentos' (`deploy-plan.ts`, `vps.ts`, `check-live.ts`, `prepare-vps.sh`, the wizard), adapted.

## Decision

- **A Docker container behind the host's Nginx, swapped blue/green.** `frontend/scripts/deploy-plan.ts` builds the bash each step runs; `vps.ts` runs it over SSH. The image `filmes-app:sha-<sha>` is built on the VPS from the uploaded `.output`. The new container starts on the free port of the pair 3091/3092, Nginx only passes to it after `/` answers, and the old one stops after the reload. The VPS keeps the previous image for `--rollback`.
- **Everything is filmes' own, and nothing else is touched.** Folder `/opt/filmes`, container `filmes-app`, vhost `sites-available/filmes.conf`, include `/etc/nginx/filmes/filmes-app.conf`, log format `filmes_without_query` in `conf.d/filmes-log-without-query.conf`, TLS cache `filmes_tls`, rotation `/etc/logrotate.d/filmes`, logs in `/var/log/nginx/filmes/`, certificate `cinema.finalsend.com.br`, and an SSH key of its own (`filmes-deploy`) in root's `authorized_keys`. The vhost never declares `default_server` (temestudo's has it on 80 and 443), and no script removes `sites-enabled/default`, another site's file or another image. The ports avoid 3011/3031 (temestudo), 3051 (stats) and 3071 (saude). `vps.test.ts` runs the plan on a fake VPS that already serves temestudo and checks it is left as it was.
- **The volume is `/opt/filmes/data`, mounted at `/data`**, owned by the image's `node` user (UID 1000): `db/<version>.sqlite` for the database versions `db:publish` ships (ADR 0005), and `auth.sqlite` and the sources' cache beside them, outside the swap. The container is otherwise read-only.
- **DNS:** an unproxied (grey) A record on Cloudflare, so certbot validates by webroot on the VPS (`/opt/filmes/acme`).
- **GitHub Actions deploys every push to `master`** that changes the app (`.github/workflows/deploy.yml`), and `check-live.ts` checks the site from outside. Without the `VPS_*` secrets the publish is skipped with a warning.

## Why

The VPS has room (1 core, 3.9 GB, 41 GB free) and filmes has two users. A second VPS would cost money and a second set of keys for nothing. Sharing it is only safe if a mistake in filmes' deploy cannot take temestudo or saude down: hence the separate names, the absence of `default_server`, `nginx -t` with undo before every reload, and the test on a VPS that already has neighbours.

## Consequences

- A change to a name above breaks the next swap or rollback on the live server; rename only with a migration step in the plan.
- `systemctl reload nginx` is shared: an `nginx -t` failure on the VPS caused by another site's file also stops filmes' deploy, and the reverse is prevented by the undo.
- Rotating temestudo's deploy key does not affect filmes, and the reverse.
