#!/usr/bin/env bash
# Prepares the shared temestudo VPS for filmes once, before the first deploy
# (ADR 0006), modeled on pesquisa-relacionamentos' `prepare-vps.sh`. Runs as
# root over ssh, from the repository root:
#
#   ssh root@<ip> 'bash -s -- <Let's Encrypt e-mail>' < frontend/scripts/prepare-vps.sh
#
# The VPS already serves temestudo.cloud and saude.temestudo.cloud, so this
# script only adds: the `/opt/filmes` folders (the volume with `db/` for the
# database versions and room for `auth.sqlite`), a temporary vhost on port 80
# that only serves certbot's challenge for cinema.temestudo.cloud, and that
# certificate, by webroot. It installs Docker, Nginx and certbot only when one
# is missing, never upgrades them, and touches no other site's file, port or
# container. The real vhost comes with the first deploy (`vps.ts`). It can run
# again: what is already done stays as it is.
set -euo pipefail

EMAIL=${1:?"Usage: bash -s -- <e-mail for the certificate notices>"}
HOST=cinema.temestudo.cloud
ROOT=/opt/filmes
ACME=$ROOT/acme
CERT=/etc/letsencrypt/live/$HOST/fullchain.pem

MISSING=()
command -v docker >/dev/null || MISSING+=(docker.io)
command -v nginx >/dev/null || MISSING+=(nginx)
command -v certbot >/dev/null || MISSING+=(certbot)
command -v flock >/dev/null || MISSING+=(util-linux)
if [ ${#MISSING[@]} -gt 0 ]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq "${MISSING[@]}" >/dev/null
  systemctl enable --now docker nginx >/dev/null
fi

install -d -m 755 "$ROOT" "$ACME" /var/log/nginx/filmes /etc/nginx/filmes
# The volume the container mounts at /data, owned by the image's `node`
# user (UID 1000). The deploy also ensures it.
install -d -m 750 "$ROOT/data" "$ROOT/data/db"
chown 1000:1000 "$ROOT/data" "$ROOT/data/db"

if [ -f "$CERT" ]; then
  echo "The certificate for $HOST already exists."
else
  if [ ! -e /etc/nginx/sites-enabled/filmes.conf ]; then
    # Before the first deploy. No default_server: temestudo's vhost has it.
    cat > /etc/nginx/sites-available/filmes-acme.conf <<EOF
# Temporary, until the first deploy installs filmes.conf.
server {
  listen 80;
  listen [::]:80;
  server_name $HOST;
  access_log off;
  location ^~ /.well-known/acme-challenge/ { root $ACME; }
  location / { return 503; }
}
EOF
    ln -sfn /etc/nginx/sites-available/filmes-acme.conf /etc/nginx/sites-enabled/filmes-acme.conf
    if ! nginx -t 2>/tmp/filmes-nginx-t.txt; then
      cat /tmp/filmes-nginx-t.txt >&2
      rm -f /etc/nginx/sites-enabled/filmes-acme.conf /etc/nginx/sites-available/filmes-acme.conf
      echo "nginx -t refused the temporary vhost; it was removed and nothing else changed." >&2
      exit 1
    fi
    systemctl reload nginx
  fi
  certbot certonly --webroot -w "$ACME" --cert-name "$HOST" -d "$HOST" \
    --email "$EMAIL" --agree-tos --no-eff-email -n \
    --deploy-hook 'systemctl reload nginx'
fi

# Renewal uses the same webroot, which the real vhost also serves.
certbot renew --cert-name "$HOST" --dry-run -q && echo "Certificate renewal works."
echo "VPS ready for filmes. The next push to master (or the Deploy's 'Run workflow') publishes the site."
