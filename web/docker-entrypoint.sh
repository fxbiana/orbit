#!/bin/sh
set -eu

cd /app

if [ ! -x node_modules/.bin/vite ]; then
  npm ci
fi

exec "$@"
