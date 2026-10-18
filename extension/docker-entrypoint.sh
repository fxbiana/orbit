#!/bin/sh
set -eu

cd /app

if [ ! -f .env ]; then
  echo "extension/.env is missing. Copy extension/.env.example and set VITE_CLERK_PUBLISHABLE_KEY." >&2
fi

stamp="node_modules/.docker-lock-hash"
want="$(sha256sum package-lock.json | awk '{print $1}')"
have=""
if [ -f "$stamp" ]; then
  have="$(cat "$stamp")"
fi

if [ ! -x node_modules/.bin/vite ] || [ "$want" != "$have" ]; then
  image_stamp="/opt/node_modules/.docker-lock-hash"
  image_have=""
  if [ -f "$image_stamp" ]; then
    image_have="$(cat "$image_stamp")"
  fi
  mkdir -p node_modules
  if [ "$image_have" = "$want" ]; then
    echo "Copying node_modules into the volume"
    find node_modules -mindepth 1 -delete
    cp -a /opt/node_modules/. node_modules/
  else
    echo "package-lock.json changed since the image was built. Running npm ci"
    npm ci
    printf '%s\n' "$want" > "$stamp"
  fi
fi

exec "$@"
